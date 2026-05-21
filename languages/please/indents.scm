; Auto-indentation rules for Please BUILD files.
;
; After a colon ending a function/if/for/elif/else block header,
; the next line should be indented. After the closing paren/bracket/brace
; of a call or collection, dedent back.

; Function, if, for, elif, else headers open a new indent level.
(function_definition ":" @indent)
(if_statement ":" @indent)
(for_statement ":" @indent)
(elif_clause ":" @indent)
(else_clause ":" @indent)

; Blocks close with dedent at the _dedent token.
(block) @indent

; Call argument lists and collections auto-indent.
(argument_list "(" @open ")" @close) @indent
(list "[" @open "]" @close) @indent
(dict "{" @open "}" @close) @indent
(parameters "(" @open ")" @close) @indent
