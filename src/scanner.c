/**
 * External scanner for tree-sitter-please.
 *
 * Adapted from tree-sitter-python's scanner.c.
 * Handles: NEWLINE, INDENT, DEDENT, STRING_START, STRING_CONTENT, STRING_END,
 *           ']', ')', '}'   (for bracket-depth tracking)
 *
 * Token index order MUST match `externals: [...]` in grammar.js:
 *   0 _newline
 *   1 _indent
 *   2 _dedent
 *   3 string_start
 *   4 _string_content
 *   5 string_end
 *   6 ']'
 *   7 ')'
 *   8 '}'
 */

#include "tree_sitter/array.h"
#include "tree_sitter/parser.h"

#include <assert.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>

/* ── Token indices ─────────────────────────────────────────────────────── */
enum TokenType {
    NEWLINE,
    INDENT,
    DEDENT,
    STRING_START,
    STRING_CONTENT,
    STRING_END,
    CLOSE_BRACKET,
    CLOSE_PAREN,
    CLOSE_BRACE,
};

/* ── Delimiter (string state) ──────────────────────────────────────────── */
typedef enum {
    SingleQuote = 1 << 0,
    DoubleQuote = 1 << 1,
    Raw         = 1 << 2,
    Format      = 1 << 3,
    Triple      = 1 << 4,
} Flags;

typedef struct { char flags; } Delimiter;

static inline Delimiter new_delimiter(void)            { return (Delimiter){0}; }
static inline bool is_format(const Delimiter *d)       { return d->flags & Format;      }
static inline bool is_raw(const Delimiter *d)          { return d->flags & Raw;         }
static inline bool is_triple(const Delimiter *d)       { return d->flags & Triple;      }
static inline void set_format(Delimiter *d)            { d->flags |= Format;            }
static inline void set_raw(Delimiter *d)               { d->flags |= Raw;               }
static inline void set_triple(Delimiter *d)            { d->flags |= Triple;            }

static inline int32_t end_character(const Delimiter *d) {
    if (d->flags & SingleQuote) return '\'';
    if (d->flags & DoubleQuote) return '"';
    return 0;
}

static inline void set_end_character(Delimiter *d, int32_t c) {
    if (c == '\'') d->flags |= SingleQuote;
    else if (c == '"') d->flags |= DoubleQuote;
    else assert(false);
}

/* ── Scanner state ─────────────────────────────────────────────────────── */
typedef struct {
    Array(uint16_t)  indents;
    Array(Delimiter) delimiters;
} Scanner;

static inline void advance_tok(TSLexer *lexer) { lexer->advance(lexer, false); }
static inline void skip_tok(TSLexer *lexer)    { lexer->advance(lexer, true);  }

/* ── scan ──────────────────────────────────────────────────────────────── */
bool tree_sitter_please_external_scanner_scan(void *payload, TSLexer *lexer, const bool *valid_symbols) {
    Scanner *scanner = (Scanner *)payload;

    bool error_recovery_mode = valid_symbols[STRING_CONTENT] && valid_symbols[INDENT];
    bool within_brackets =
        valid_symbols[CLOSE_BRACE] || valid_symbols[CLOSE_PAREN] || valid_symbols[CLOSE_BRACKET];

    /* ── String content ─────────────────────────────────────────────── */
    if (valid_symbols[STRING_CONTENT] && scanner->delimiters.size > 0 && !error_recovery_mode) {
        Delimiter *delimiter = array_back(&scanner->delimiters);
        int32_t end_char = end_character(delimiter);
        bool has_content = false;

        while (lexer->lookahead) {
            /* f-string interpolation boundary */
            if (is_format(delimiter) && (lexer->lookahead == '{' || lexer->lookahead == '}')) {
                lexer->mark_end(lexer);
                lexer->result_symbol = STRING_CONTENT;
                return has_content;
            }

            if (lexer->lookahead == '\\') {
                if (is_raw(delimiter)) {
                    advance_tok(lexer);
                    if (lexer->lookahead == end_character(delimiter) || lexer->lookahead == '\\') {
                        advance_tok(lexer);
                    }
                    if (lexer->lookahead == '\r') { advance_tok(lexer); }
                    if (lexer->lookahead == '\n') { advance_tok(lexer); }
                    continue;
                }
                /* Normal escape: stop content here so escape_sequence token takes over */
                lexer->mark_end(lexer);
                lexer->result_symbol = STRING_CONTENT;
                return has_content;
            }

            if (lexer->lookahead == end_char) {
                if (is_triple(delimiter)) {
                    lexer->mark_end(lexer);
                    advance_tok(lexer);
                    if (lexer->lookahead == end_char) {
                        advance_tok(lexer);
                        if (lexer->lookahead == end_char) {
                            /* Found end of triple-quoted string */
                            if (has_content) {
                                lexer->result_symbol = STRING_CONTENT;
                            } else {
                                advance_tok(lexer);
                                lexer->mark_end(lexer);
                                array_pop(&scanner->delimiters);
                                lexer->result_symbol = STRING_END;
                            }
                            return true;
                        }
                        /* Two quotes then other char: content */
                        lexer->mark_end(lexer);
                        lexer->result_symbol = STRING_CONTENT;
                        return true;
                    }
                    /* One quote then other char: content */
                    lexer->mark_end(lexer);
                    lexer->result_symbol = STRING_CONTENT;
                    return true;
                }
                /* Single-quoted: end of string */
                if (has_content) {
                    lexer->result_symbol = STRING_CONTENT;
                } else {
                    advance_tok(lexer);
                    array_pop(&scanner->delimiters);
                    lexer->result_symbol = STRING_END;
                }
                lexer->mark_end(lexer);
                return true;
            }

            if (lexer->lookahead == '\n' && has_content && !is_triple(delimiter)) {
                return false;
            }

            advance_tok(lexer);
            has_content = true;
        }
    }

    lexer->mark_end(lexer);

    /* ── Scan indentation / newline ─────────────────────────────────── */
    bool found_end_of_line = false;
    uint16_t indent_length = 0;
    int32_t first_comment_indent_length = -1;

    for (;;) {
        if (lexer->lookahead == '\n') {
            found_end_of_line = true;
            indent_length = 0;
            skip_tok(lexer);
        } else if (lexer->lookahead == ' ') {
            indent_length++;
            skip_tok(lexer);
        } else if (lexer->lookahead == '\r' || lexer->lookahead == '\f') {
            indent_length = 0;
            skip_tok(lexer);
        } else if (lexer->lookahead == '\t') {
            indent_length += 8;
            skip_tok(lexer);
        } else if (lexer->lookahead == '#' &&
                   (valid_symbols[INDENT] || valid_symbols[DEDENT] || valid_symbols[NEWLINE])) {
            if (!found_end_of_line) return false;
            if (first_comment_indent_length == -1) {
                first_comment_indent_length = (int32_t)indent_length;
            }
            while (lexer->lookahead && lexer->lookahead != '\n') skip_tok(lexer);
            skip_tok(lexer);
            indent_length = 0;
        } else if (lexer->lookahead == '\\') {
            skip_tok(lexer);
            if (lexer->lookahead == '\r') skip_tok(lexer);
            if (lexer->lookahead == '\n' || lexer->eof(lexer)) {
                skip_tok(lexer);
            } else {
                return false;
            }
        } else if (lexer->eof(lexer)) {
            indent_length = 0;
            found_end_of_line = true;
            break;
        } else {
            break;
        }
    }

    if (found_end_of_line) {
        if (scanner->indents.size > 0) {
            uint16_t current_indent = *array_back(&scanner->indents);

            if (valid_symbols[INDENT] && indent_length > current_indent) {
                array_push(&scanner->indents, indent_length);
                lexer->result_symbol = INDENT;
                return true;
            }

            bool next_is_string_start = lexer->lookahead == '"' || lexer->lookahead == '\'';

            if ((valid_symbols[DEDENT] ||
                 (!valid_symbols[NEWLINE] &&
                  !(valid_symbols[STRING_START] && next_is_string_start) &&
                  !within_brackets)) &&
                indent_length < current_indent &&
                first_comment_indent_length < (int32_t)current_indent) {
                array_pop(&scanner->indents);
                lexer->result_symbol = DEDENT;
                return true;
            }
        }

        if (valid_symbols[NEWLINE] && !error_recovery_mode) {
            lexer->result_symbol = NEWLINE;
            return true;
        }
    }

    /* ── String start ───────────────────────────────────────────────── */
    if (first_comment_indent_length == -1 && valid_symbols[STRING_START]) {
        Delimiter delimiter = new_delimiter();
        bool has_flags = false;

        while (lexer->lookahead) {
            if (lexer->lookahead == 'f' || lexer->lookahead == 'F') {
                set_format(&delimiter);
            } else if (lexer->lookahead == 'r' || lexer->lookahead == 'R') {
                set_raw(&delimiter);
            } else if (lexer->lookahead == 'u' || lexer->lookahead == 'U') {
                /* unicode prefix — accepted but ignored */
            } else {
                break;
            }
            has_flags = true;
            advance_tok(lexer);
        }

        if (lexer->lookahead == '\'') {
            set_end_character(&delimiter, '\'');
            advance_tok(lexer);
            lexer->mark_end(lexer);
            if (lexer->lookahead == '\'') {
                advance_tok(lexer);
                if (lexer->lookahead == '\'') {
                    advance_tok(lexer);
                    lexer->mark_end(lexer);
                    set_triple(&delimiter);
                }
            }
        } else if (lexer->lookahead == '"') {
            set_end_character(&delimiter, '"');
            advance_tok(lexer);
            lexer->mark_end(lexer);
            if (lexer->lookahead == '"') {
                advance_tok(lexer);
                if (lexer->lookahead == '"') {
                    advance_tok(lexer);
                    lexer->mark_end(lexer);
                    set_triple(&delimiter);
                }
            }
        }

        if (end_character(&delimiter)) {
            array_push(&scanner->delimiters, delimiter);
            lexer->result_symbol = STRING_START;
            return true;
        }
        if (has_flags) return false;
    }

    return false;
}

/* ── serialize / deserialize ───────────────────────────────────────────── */
unsigned tree_sitter_please_external_scanner_serialize(void *payload, char *buffer) {
    Scanner *scanner = (Scanner *)payload;
    size_t size = 0;

    size_t delimiter_count = scanner->delimiters.size;
    if (delimiter_count > UINT8_MAX) delimiter_count = UINT8_MAX;
    buffer[size++] = (char)delimiter_count;
    if (delimiter_count > 0) {
        memcpy(&buffer[size], scanner->delimiters.contents, delimiter_count);
    }
    size += delimiter_count;

    for (uint32_t i = 1; i < scanner->indents.size && size < TREE_SITTER_SERIALIZATION_BUFFER_SIZE - 1; i++) {
        uint16_t v = *array_get(&scanner->indents, i);
        buffer[size++] = (char)(v & 0xFF);
        buffer[size++] = (char)((v >> 8) & 0xFF);
    }

    return size;
}

void tree_sitter_please_external_scanner_deserialize(void *payload, const char *buffer, unsigned length) {
    Scanner *scanner = (Scanner *)payload;
    array_delete(&scanner->delimiters);
    array_delete(&scanner->indents);
    array_push(&scanner->indents, 0);

    if (length > 0) {
        size_t size = 0;

        size_t delimiter_count = (uint8_t)buffer[size++];
        if (delimiter_count > 0) {
            array_reserve(&scanner->delimiters, delimiter_count);
            scanner->delimiters.size = delimiter_count;
            memcpy(scanner->delimiters.contents, &buffer[size], delimiter_count);
            size += delimiter_count;
        }

        for (; size + 1 < length; size += 2) {
            uint16_t v = (uint8_t)buffer[size] | ((uint8_t)buffer[size + 1] << 8);
            array_push(&scanner->indents, v);
        }
    }
}

/* ── create / destroy ──────────────────────────────────────────────────── */
void *tree_sitter_please_external_scanner_create(void) {
    Scanner *scanner = (Scanner *)calloc(1, sizeof(Scanner));
    array_init(&scanner->indents);
    array_init(&scanner->delimiters);
    tree_sitter_please_external_scanner_deserialize(scanner, NULL, 0);
    return scanner;
}

void tree_sitter_please_external_scanner_destroy(void *payload) {
    Scanner *scanner = (Scanner *)payload;
    array_delete(&scanner->indents);
    array_delete(&scanner->delimiters);
    free(scanner);
}
