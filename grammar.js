/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

/**
 * Tree-sitter grammar for the Please build system BUILD language.
 *
 * Please BUILD is a Python subset with:
 *   - No import, try, except, finally, class, global, nonlocal, while, async
 *   - Type annotations on function parameters: name:type1|type2
 *   - Argument aliasing: &alias_name
 *   - f-strings limited to {varname} interpolation only
 *   - Build labels: //pkg:name  :name  ///subrepo//pkg:name
 *
 * Grammar architecture mirrors tree-sitter-python: all whitespace (including
 * newlines) is in `extras` so it is ignored everywhere except where the grammar
 * explicitly requires $._newline / $._indent / $._dedent tokens produced by
 * the external scanner.  The scanner is also responsible for bracket-depth
 * tracking so newlines inside ( [ { are silently consumed.
 *
 * Reference: https://please.build/language.html
 */

const PREC = {
  lambda:      -2,
  conditional: -1,
  or:          10,
  and:         11,
  not:         12,
  compare:     13,
  bitwise_or:  14,
  plus:        18,
  times:       19,
  unary:       20,
  call:        22,
};

module.exports = grammar({
  name: "please",

  // All whitespace (including newlines) is ignored by default.
  // The external scanner emits NEWLINE / INDENT / DEDENT when the grammar
  // asks for them; it also consumes newlines inside brackets transparently.
  extras: ($) => [$.comment, /[\s\f\uFEFF\u2060\u200B]|\r?\n/, $.line_continuation],

  externals: ($) => [
    $._newline,
    $._indent,
    $._dedent,
    $.string_start,
    $._string_content,
    $.string_end,

    // Expose closing brackets to the external scanner so it can track
    // bracket depth and suppress NEWLINE/INDENT/DEDENT inside brackets.
    "]",
    ")",
    "}",
  ],

  conflicts: ($) => [
    [$.primary_expression, $.pattern],
  ],

  word: ($) => $.identifier,

  inline: ($) => [$._simple_statement, $._compound_statement, $._suite],

  rules: {
    // =========================================================================
    // Top level
    // =========================================================================

    source_file: ($) => repeat($._statement),

    _statement: ($) =>
      choice($._simple_statements, $._compound_statement),

    // Simple statements end with a newline (or semicolon-separated).
    _simple_statements: ($) =>
      seq(
        sep1($._simple_statement, ";"),
        optional(";"),
        $._newline,
      ),

    _simple_statement: ($) =>
      choice(
        $.pass_statement,
        $.continue_statement,
        $.break_statement,
        $.return_statement,
        $.assert_statement,
        $.delete_statement,
        $.expression_statement,
        $.assignment,
        $.augmented_assignment,
      ),

    // =========================================================================
    // Simple statements
    // =========================================================================

    pass_statement:     (_) => prec.left("pass"),
    break_statement:    (_) => prec.left("break"),
    continue_statement: (_) => prec.left("continue"),

    delete_statement: ($) => seq("del", $.expression),

    return_statement: ($) =>
      seq("return", optional(commaSep1($.expression))),

    assert_statement: ($) =>
      seq("assert", commaSep1($.expression)),

    expression_statement: ($) =>
      choice($.expression, $.tuple_expression),

    tuple_expression: ($) =>
      seq(
        $.expression,
        ",",
        optional(seq(commaSep1($.expression), optional(","))),
      ),

    assignment: ($) =>
      seq(
        field("left", $._left_hand_side),
        "=",
        field("right", $.expression),
      ),

    augmented_assignment: ($) =>
      seq(
        field("left", $._left_hand_side),
        field("operator", choice("+=", "-=", "*=", "/=", "//=", "%=", "|=")),
        field("right", $.expression),
      ),

    _left_hand_side: ($) =>
      choice($.pattern, $.pattern_list),

    pattern_list: ($) =>
      seq(
        $.pattern,
        choice(",", seq(repeat1(seq(",", $.pattern)), optional(","))),
      ),

    pattern: ($) =>
      choice(
        $.identifier,
        $.subscript,
        $.attribute,
      ),

    // =========================================================================
    // Compound statements
    // =========================================================================

    _compound_statement: ($) =>
      choice(
        $.function_definition,
        $.for_statement,
        $.if_statement,
      ),

    // =========================================================================
    // Function definition
    // =========================================================================

    function_definition: ($) =>
      seq(
        "def",
        field("name", $.identifier),
        field("parameters", $.parameters),
        optional(seq("->", field("return_type", $.type_annotation))),
        ":",
        field("body", $._suite),
      ),

    parameters: ($) =>
      seq(
        "(",
        optional(seq(commaSep1($.parameter), optional(","))),
        ")",
      ),

    parameter: ($) =>
      seq(
        field("name", $.identifier),
        optional(seq(":", field("type", $.type_annotation))),
        repeat(seq("&", field("alias", $.identifier))),
        optional(seq("=", field("default", $.expression))),
      ),

    // Type annotation: one or more type names separated by |
    // e.g.  str | list | dict
    type_annotation: ($) =>
      sep1($.type_name, "|"),

    type_name: ($) =>
      choice(
        "str", "int", "bool", "list", "dict", "function", "config",
        $.identifier,
      ),

    // =========================================================================
    // Control flow
    // =========================================================================

    for_statement: ($) =>
      seq(
        "for",
        field("left", $._left_hand_side),
        "in",
        field("right", $.expression),
        ":",
        field("body", $._suite),
        optional(field("alternative", $.else_clause)),
      ),

    if_statement: ($) =>
      seq(
        "if",
        field("condition", $.expression),
        ":",
        field("consequence", $._suite),
        repeat(field("alternative", $.elif_clause)),
        optional(field("alternative", $.else_clause)),
      ),

    elif_clause: ($) =>
      seq(
        "elif",
        field("condition", $.expression),
        ":",
        field("consequence", $._suite),
      ),

    else_clause: ($) =>
      seq("else", ":", field("body", $._suite)),

    // Block — the external scanner emits INDENT at start, DEDENT at end.
    _suite: ($) =>
      choice(
        alias($._simple_statements, $.block),
        seq($._indent, $.block),
        alias($._newline, $.block),
      ),

    block: ($) => seq(repeat($._statement), $._dedent),

    // =========================================================================
    // Expressions
    // =========================================================================

    expression: ($) =>
      choice(
        $.comparison_operator,
        $.not_operator,
        $.boolean_operator,
        $.lambda,
        $.primary_expression,
        $.conditional_expression,
      ),

    conditional_expression: ($) =>
      prec.right(
        PREC.conditional,
        seq($.expression, "if", $.expression, "else", $.expression),
      ),

    lambda: ($) =>
      prec(
        PREC.lambda,
        seq(
          "lambda",
          optional(field("parameters", $.lambda_parameters)),
          ":",
          field("body", $.expression),
        ),
      ),

    lambda_parameters: ($) => commaSep1($.lambda_parameter),

    lambda_parameter: ($) =>
      seq(
        field("name", $.identifier),
        optional(seq("=", field("default", $.expression))),
      ),

    not_operator: ($) =>
      prec(PREC.not, seq("not", field("argument", $.expression))),

    boolean_operator: ($) =>
      choice(
        prec.left(PREC.and, seq(
          field("left", $.expression),
          field("operator", "and"),
          field("right", $.expression),
        )),
        prec.left(PREC.or, seq(
          field("left", $.expression),
          field("operator", "or"),
          field("right", $.expression),
        )),
      ),

    comparison_operator: ($) =>
      prec.left(
        PREC.compare,
        seq(
          $.primary_expression,
          repeat1(
            seq(
              field("operators", choice(
                "<", "<=", "==", "!=", ">=", ">",
                "in",
                seq("not", "in"),
                "is",
                seq("is", "not"),
              )),
              $.primary_expression,
            ),
          ),
        ),
      ),

    // =========================================================================
    // Primary expressions
    // =========================================================================

    primary_expression: ($) =>
      choice(
        $.binary_operator,
        $.identifier,
        $.string,
        $.concatenated_string,
        $.integer,
        $.true,
        $.false,
        $.none,
        $.unary_operator,
        $.attribute,
        $.subscript,
        $.call,
        $.list,
        $.list_comprehension,
        $.dict,
        $.dict_comprehension,
        $.tuple,
        $.parenthesized_expression,
        $.build_label,
      ),

    binary_operator: ($) => {
      const table = [
        [prec.left, "+",  PREC.plus],
        [prec.left, "-",  PREC.plus],
        [prec.left, "*",  PREC.times],
        [prec.left, "/",  PREC.times],
        [prec.left, "//", PREC.times],
        [prec.left, "%",  PREC.times],
        [prec.left, "|",  PREC.bitwise_or],
      ];
      // @ts-ignore
      return choice(...table.map(([fn, operator, precedence]) =>
        // @ts-ignore
        fn(precedence, seq(
          field("left", $.primary_expression),
          field("operator", operator),
          field("right", $.primary_expression),
        ))
      ));
    },

    unary_operator: ($) =>
      prec(
        PREC.unary,
        seq(
          field("operator", choice("+", "-", "~")),
          field("argument", $.primary_expression),
        ),
      ),

    attribute: ($) =>
      prec(
        PREC.call,
        seq(
          field("object", $.primary_expression),
          ".",
          field("attribute", $.identifier),
        ),
      ),

    subscript: ($) =>
      prec(
        PREC.call,
        seq(
          field("value", $.primary_expression),
          "[",
          commaSep1(field("subscript", choice($.expression, $.slice))),
          optional(","),
          "]",
        ),
      ),

    slice: ($) =>
      seq(
        optional($.expression),
        ":",
        optional($.expression),
        optional(seq(":", optional($.expression))),
      ),

    call: ($) =>
      prec(
        PREC.call,
        seq(
          field("function", $.primary_expression),
          field("arguments", $.argument_list),
        ),
      ),

    argument_list: ($) =>
      seq(
        "(",
        optional(seq(commaSep1($.argument), optional(","))),
        ")",
      ),

    argument: ($) =>
      choice(
        seq(
          field("name", $.identifier),
          "=",
          field("value", $.expression),
        ),
        field("value", $.expression),
      ),

    // =========================================================================
    // Literals
    // =========================================================================

    true:  (_) => "True",
    false: (_) => "False",
    none:  (_) => "None",

    integer: (_) =>
      token(
        choice(
          seq(choice("0x", "0X"), /[0-9a-fA-F]+/),
          seq(choice("0o", "0O"), /[0-7]+/),
          seq(choice("0b", "0B"), /[01]+/),
          /[0-9]+/,
        ),
      ),

    // =========================================================================
    // Collections
    // =========================================================================

    list: ($) =>
      seq("[", optional(seq(commaSep1($.expression), optional(","))), "]"),

    dict: ($) =>
      seq("{", optional(seq(commaSep1($.dict_pair), optional(","))), "}"),

    dict_pair: ($) =>
      seq(field("key", $.expression), ":", field("value", $.expression)),

    tuple: ($) =>
      seq(
        "(",
        $.expression,
        ",",
        optional(seq(commaSep1($.expression), optional(","))),
        ")",
      ),

    parenthesized_expression: ($) =>
      prec(1, seq("(", $.expression, ")")),

    // =========================================================================
    // Comprehensions
    // =========================================================================

    list_comprehension: ($) =>
      seq(
        "[",
        field("body", $.expression),
        $._comprehension_clauses,
        "]",
      ),

    dict_comprehension: ($) =>
      seq(
        "{",
        field("body", $.dict_pair),
        $._comprehension_clauses,
        "}",
      ),

    _comprehension_clauses: ($) =>
      seq($.for_in_clause, repeat(choice($.for_in_clause, $.if_clause))),

    for_in_clause: ($) =>
      prec.left(
        seq(
          "for",
          field("left", $._left_hand_side),
          "in",
          field("right", commaSep1($.expression)),
        ),
      ),

    if_clause: ($) => seq("if", $.expression),

    // =========================================================================
    // Strings — delegated to external scanner
    // =========================================================================

    string: ($) =>
      seq(
        $.string_start,
        repeat(choice($.interpolation, $.string_content)),
        $.string_end,
      ),

    string_content: ($) =>
      prec.right(repeat1(choice($.escape_sequence, $._string_content))),

    interpolation: ($) =>
      seq("{", field("expression", $.identifier), "}"),

    escape_sequence: (_) =>
      token.immediate(
        prec(
          1,
          seq(
            "\\",
            choice(
              /u[a-fA-F\d]{4}/,
              /U[a-fA-F\d]{8}/,
              /x[a-fA-F\d]{2}/,
              /\d{1,3}/,
              /\r?\n/,
              /['"abfrntv\\]/,
            ),
          ),
        ),
      ),

    concatenated_string: ($) => seq($.string, repeat1($.string)),

    // =========================================================================
    // Build labels (Please-specific)
    //
    //  ///subrepo//pkg/path:target
    //  //pkg/path:target
    //  //pkg/path
    //  :target
    //  //path/to:rule|entry-point
    // =========================================================================

    build_label: (_) =>
      token(
        choice(
          // subrepo form: ///subrepo//pkg:target
          seq(
            "///",
            /[a-zA-Z0-9_\-\.]+/,
            "//",
            /[a-zA-Z0-9_\-\.\/]*/,
            optional(seq(":", /[a-zA-Z0-9_\-\.\/\+@\*]+/)),
            optional(seq("|", /[a-zA-Z0-9_\-\.\/]+/)),
          ),
          // absolute: //pkg:target or //pkg
          seq(
            "//",
            /[a-zA-Z0-9_\-\.\/]*/,
            optional(seq(":", /[a-zA-Z0-9_\-\.\/\+@\*]+/)),
            optional(seq("|", /[a-zA-Z0-9_\-\.\/]+/)),
          ),
          // relative: :target
          seq(":", /[a-zA-Z0-9_\-\.\/\+@]+/),
        ),
      ),

    // =========================================================================
    // Miscellaneous
    // =========================================================================

    identifier: (_) => /[a-zA-Z_][a-zA-Z0-9_]*/,

    comment: (_) => token(seq("#", /.*/)),

    line_continuation: (_) =>
      token(seq("\\", choice(seq(optional("\r"), "\n"), "\0"))),
  },
});

/**
 * Creates a rule to match one or more of the rules separated by a comma.
 * @param {RuleOrLiteral} rule
 * @returns {SeqRule}
 */
function commaSep1(rule) {
  return seq(rule, repeat(seq(",", rule)));
}

/**
 * Creates a rule to match one or more occurrences of `rule` separated by `sep`.
 * @param {RuleOrLiteral} rule
 * @param {RuleOrLiteral} separator
 * @returns {SeqRule}
 */
function sep1(rule, separator) {
  return seq(rule, repeat(seq(separator, rule)));
}
