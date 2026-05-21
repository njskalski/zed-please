; Keywords
[
  "def"
  "return"
  "pass"
  "break"
  "continue"
  "if"
  "elif"
  "else"
  "for"
  "in"
  "not"
  "and"
  "or"
  "is"
  "lambda"
  "assert"
  "del"
] @keyword

; Builtin constants
[
  (true)
  (false)
  (none)
] @constant.builtin

; Operators
[
  "+"  "-"  "*"  "/"  "//"  "%"  "|"
  "+=" "-=" "*=" "/=" "//=" "%=" "|="
  "==" "!=" "<"  ">"  "<="  ">="
  "="
] @operator

; Literals
(integer) @number

(string) @string
(string_content
  (escape_sequence) @string.escape)
(string
  (interpolation
    "{" @punctuation.special
    expression: (identifier) @variable
    "}" @punctuation.special))
(build_label) @string.special

; Comments
(comment) @comment

; Function definitions
(function_definition
  "def" @keyword
  name: (identifier) @function)

; Function calls
(call
  function: (primary_expression
    (identifier) @function.call))
(call
  function: (primary_expression
    (attribute
      attribute: (identifier) @function.method)))

; Keyword arguments
(argument
  name: (identifier) @variable.parameter)

; Parameters
(parameter
  name: (identifier) @variable.parameter)

; Type annotations in parameters
(type_annotation
  (type_name) @type.builtin)

; Identifiers
(identifier) @variable

; CONFIG is a special global
((identifier) @constant
  (#eq? @constant "CONFIG"))

; Punctuation
["(" ")" "[" "]" "{" "}"] @punctuation.bracket
["," "." ":" ";"]         @punctuation.delimiter
