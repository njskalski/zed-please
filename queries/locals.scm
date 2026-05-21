; Scopes
(source_file) @local.scope
(function_definition) @local.scope
(block) @local.scope
(for_statement) @local.scope

; Definitions
(assignment
  left: (pattern
    (identifier) @local.definition))
(function_definition
  name: (identifier) @local.definition)
(parameter
  name: (identifier) @local.definition)
(for_statement
  left: (pattern
    (identifier) @local.definition))
(for_in_clause
  left: (pattern
    (identifier) @local.definition))

; References
(identifier) @local.reference
