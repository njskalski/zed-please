; Auto-indentation rules for Please BUILD files.

; Function, if, for, elif, else headers open a new indent level.
(function_definition ":" @indent)
(if_statement ":" @indent)
(for_statement ":" @indent)
(elif_clause ":" @indent)
(else_clause ":" @indent)

; Blocks close with dedent.
(block) @indent

; Call argument lists and collections auto-indent.
(argument_list "(" @_open ")" @end) @indent
(list "[" @_open "]" @end) @indent
(dict "{" @_open "}" @end) @indent
(parameters "(" @_open ")" @end) @indent
