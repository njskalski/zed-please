; Code outline — surfaces function definitions and top-level build rule calls.

; Show function definitions in the outline.
(function_definition
  name: (identifier) @name) @item

; Show top-level build rule calls (filegroup, go_library, genrule, etc.)
; The rule name is the value of the `name = "..."` keyword argument.
(expression_statement
  (expression
    (primary_expression
      (call
        function: (primary_expression
          (identifier) @context)
        arguments: (argument_list
          (argument
            name: (identifier) @_name_key
            value: (expression
              (primary_expression
                (string
                  (string_content) @name))))))))
  (#eq? @_name_key "name")) @item
