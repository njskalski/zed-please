; ── Keywords ────────────────────────────────────────────────────────────────

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

; ── Built-in constants ───────────────────────────────────────────────────────

(true)  @boolean
(false) @boolean
(none)  @constant.builtin

; ── CONFIG global ────────────────────────────────────────────────────────────

((identifier) @constant
  (#eq? @constant "CONFIG"))

; ── Operators ────────────────────────────────────────────────────────────────

[
  "+" "-" "*" "/" "//" "%" "|"
  "+=" "-=" "*=" "/=" "//=" "%=" "|="
  "==" "!=" "<" ">" "<=" ">="
  "="
  "->"
  ":"
] @operator

; ── Numeric literals ─────────────────────────────────────────────────────────

(integer) @number

; ── Strings & build labels ───────────────────────────────────────────────────

(string)        @string
(build_label)   @string.special

(string_content
  (escape_sequence) @string.escape)

; f-string interpolation braces
(interpolation
  "{" @punctuation.special
  "}" @punctuation.special)

; ── Comments ─────────────────────────────────────────────────────────────────

(comment) @comment

; ── Function / rule definitions ──────────────────────────────────────────────

(function_definition
  name: (identifier) @function)

; ── Function calls ───────────────────────────────────────────────────────────

; Plain identifier calls: go_library(...), filegroup(...), genrule(...)
(call
  function: (primary_expression
    (identifier) @function))

; Method calls: CONFIG.get(...), x.foo(...)
(call
  function: (primary_expression
    (attribute
      attribute: (identifier) @function)))

; ── Call arguments (keyword names) ───────────────────────────────────────────

(argument
  name: (identifier) @variable.parameter)

; ── Function parameters ───────────────────────────────────────────────────────

(parameter
  name: (identifier) @variable.parameter)

(parameter
  alias: (identifier) @variable.parameter)

; ── Type annotations ─────────────────────────────────────────────────────────

(type_annotation
  (type_name) @type.builtin)

; ── Attribute access ─────────────────────────────────────────────────────────

(attribute
  attribute: (identifier) @property)

; ── General identifiers ──────────────────────────────────────────────────────

(identifier) @variable

; ── Punctuation ──────────────────────────────────────────────────────────────

["(" ")" "[" "]" "{" "}"] @punctuation.bracket
["," "." ";"]              @punctuation.delimiter
