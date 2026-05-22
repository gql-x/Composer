# @gql-x/composer

A DSL for composing GraphQL query strings with nicer DX.

`@gql-x/composer` is a general-purpose GraphQL query composer: it produces plain, spec-compliant GraphQL text suitable for any GraphQL endpoint, any client transport, any tooling.

Think of it as a spiritual successor to the older [`gql-query-builder`](https://www.npmjs.com/package/gql-query-builder) package — solving the same problem (building GraphQL queries from host-language values rather than templated strings), but with better ergonomics around variable hoisting, dynamic composition, and field-level expressivity. None of the code or API is ported or shared; the kinship is in problem space and motivation, not in implementation.

For design rationale and tradeoffs, see [DESIGN.md](./DESIGN.md). For details on the extension points composer exposes for building higher-level layers on top of it, see [EXTENSIBILITY.md](./EXTENSIBILITY.md).

## Design Overview

Two primary goals motivate the design:

1. **Reduce variable bookkeeping.** Annotate a variable's type at its use site; the builder hoists the declaration into the operation's parameter list and deduplicates automatically.

2. **First-class dynamic composition.** Query fragments — arguments, selection-sets, and so on — are plain JS values that can be conditionally included, named, passed around, and combined using ordinary host-language logic. No string templating, no parameter-list maintenance.

A third theme runs throughout: meaning is conveyed by explicit names (`selectionSet`, `varArgs`, `litArgs`) rather than syntactic position. This trades raw-GraphQL positional convention for label-driven composition that can be reordered to foreground whatever matters most about a given query.

## Getting Started

Composer is a factory-producing module: each call to `createComposer()` returns its own independent instance with its own closure-private state (token symbols, internal WeakMaps, caches). Two instances don't share tokens — this isolation is deliberate and non-negotiable.

```js
import { createComposer } from "@gql-x/composer";

var {
    $f, $t, $v, $m,
    varArgs, litArgs, varDefs,
    selectionSet, root,
    queryBuilder,
    isGQLName,
} = createComposer();
```

The destructured names above are the full public API surface of a composer instance. Everything else in this README is documenting one of these.

If you don't intend to use a particular helper, you can omit it from the destructuring — there's no penalty for selective imports.

```js
// minimal: just the builder + the bits used in the simplest query
var { queryBuilder, root, selectionSet, } = createComposer();

queryBuilder(
    root("ping"),
    selectionSet("ok")
)
// → { text: "{ ping { ok } }", operationName: "", resultName: "ping" }
```

## At a Glance

Suppose you want to write a GraphQL query like the one below, fetching a user by ID with a date-bounded sub-selection of recent posts:

```graphql
query GetUser(
    $userID: ID,
    $sinceDate: DateTime
) {
    user(id: $userID) {
        firstName
        lastName
        recentPosts: posts(since: $sinceDate) {
            title
            publishedAt
        }
    }
}
```

A few things stand out as friction:

* **Variable duplication.** `$userID` is declared once but its definition (`$userID: ID`) lives far away from its use site. Same for `$sinceDate`.
* **Sigil bookkeeping.** Every variable carries a `$` everywhere it appears. Easy to typo, easy to forget.
* **Nesting tax.** Field aliases, field-level arguments, and sub-selections each have their own syntactic shape to remember.

Here's the equivalent using the composer:

```js
import { createComposer } from "@gql-x/composer";

var {
    $f, $v, $m,
    varArgs, selectionSet, root,
    queryBuilder,
} = createComposer();

queryBuilder(
    { operationName: "GetUser" },
    root("user"),
    varArgs($v("id","userID","ID")),
    selectionSet(
        "firstName",
        "lastName",
        $m(
            $f`recentPosts``posts ${
                varArgs($v("since","sinceDate","DateTime"))
            }`,
            [ "title", "publishedAt" ]
        )
    )
)
```

For the rest of this README, assume the helpers used in any given example have been destructured from a `createComposer()` call as shown above.

Variables are declared inline at their use sites, then hoisted into the parameter list (and de-duplicated) by the builder, so you never have to type both a separate parameter declaration and the use-site reference.

The rest of this README walks through each helper and the full query-builder surface.

## Fluent Helpers vs. Object Literal Forms

The composer provides two families of helpers, and both produce plain JS object structures that the query-builder consumes:

1. **Option-key helpers** like `varArgs(..)`, `litArgs(..)`, `varDefs(..)`, `selectionSet(..)`, `root(..)`. Each produces a single-property object keyed by its option name. They're passed as variadic arguments to `queryBuilder(..)`.

    In other words, `varArgs(..)` produces `{ varArgs: .. }`.

2. **Chunk-producing helpers** like `$v(..)`, `$m(..)`, `` $f`...` ``. They produce structural object chunks for the inside of those options.

    In other words, `$m(..)` produces `{ field: value }`.

Both families are pure object-shape sugar. Every helper has an equivalent object literal form, and the query-builder accepts either form interchangeably. Mix and match freely.

```js
// helper form (recommended)
queryBuilder(
    root("user"),
    varArgs($v("id","ID")),
    selectionSet("firstName","lastName")
)

// object literal form (also accepted)
queryBuilder({
    root: { field: "user" },
    varArgs: { id: "ID" },
    selectionSet: [ "firstName", "lastName" ]
})

// mixed (also accepted)
queryBuilder(
    root("user"),
    varArgs({ id: "ID" }),
    { selectionSet: [ "firstName", "lastName" ] }
)
```

The object literal forms are the base. The helpers exist as sugar on top, to reduce repetition and visual syn-tax. If a helper doesn't fit a particular shape cleanly, drop down to an object literal for that piece and keep using helpers elsewhere.

## Query Builder Options

`queryBuilder(..)` accepts variadic option-key helpers (or a single options object), and returns a query-builder result object (see below).

The following options are recognized:

* `kind` (string, default: `"query"`): allows `"query"` or `"mutation"`.

* `operationName` (string, default: `""`): the operation name in the query text (e.g., `GetUser`). Pass `null` or `""` to omit, in which case the builder falls back to `Query` / `Mutation` if variable defs are present, or omits the operation header entirely if not.

* `root` (object): specifies the root field shape. Most easily produced via the `root(..)` option-key helper.

    `root(field)` — bare field:

    ```js
    root("user")
    // { root: { field: "user" } }
    ```

    Produces a root like `user(..) { .. }`.

    `root(field, alias)` — aliased root:

    ```js
    root("currentUser","user")
    // { root: { field: "currentUser", alias: "user" } }
    ```

    Produces a root like `currentUser: user(..) { .. }`.

* `varArgs` (option): operation-level (and field-level) arguments whose values are variable type-defs. The builder hoists the type-defs into the operation parameter list automatically.

    For example:

    ```js
    varArgs(
        $v("id","userID","ID"),
        $v("limit","Int")
    )
    ```

    Produces operation parameters: `$userID: ID, $limit: Int`, and operation arguments: `id: $userID, limit: $limit`.

* `litArgs` (option): operation-level (and field-level) arguments with literal values. Leaf values can be built-in JS types (`42`, `"hello"`, `true`), bare-tokens via `$t` (e.g., `$t.DESC`), or manual variable references via `$t` (e.g., `$t.$orderBy`).

    For example:

    ```js
    litArgs(
        $m("order", $m("lastName", $t.DESC)),
        $m("limit", 50)
    )
    ```

    Produces: `order: { lastName: DESC }, limit: 50`.

* `varDefs` (option): manual variable type-defs. Adds explicit parameter declarations to the operation without tying them to any specific argument position; useful when a variable is referenced manually via `$t.$varName` in literal-based arguments.

    For example:

    ```js
    varDefs($v("orderBy","String"))
    ```

    Adds `$orderBy: String` to the operation's variable type definitions. The variable can then be referenced in `litArgs` (operation-level or field-level) via `$t.$orderBy`.

* `selectionSet` (option): the fields to include in the selection-set.

    For example:

    ```js
    selectionSet(
        "firstName",
        "lastName",
        $f`ownerEmail``email`
    )
    ```

    Produces: `firstName lastName ownerEmail: email`.

    Each argument is a selection entry: a bare string for a scalar field, an `$f` helper for an aliased or argument-bearing field reference, or an object-keyed entry for sub-selections (see "Field-Level Selections" below).

    To omit the selection-set block entirely: `selectionSet(null)`, `selectionSet($f.noSelection)`, or `selectionSet.none()`.

## Chunk-Producing Helpers

### `$v` — Variable Leaf Specs

`$v` builds variable leaf-specs for `varArgs` and `varDefs`.

`$v(chunk1, chunk2, ..)` composes/merges chunks; it takes the place of an object literal on the right side of `varArgs:` / `varDefs:`, merging the individual leaf chunks passed in.

```js
varArgs: $v(
    $v("id","ID"),
    $v("limit","Int")
)
```

**NOTE:** Since `$v(..)` composes object chunks, the chunks it accepts can also be object-spread directly into a regular object literal as a more flexible alternative.

The 2-arg form `$v(name,type)` defaults the variable name to the argument name:

```js
$v("id","ID")
// chunk: { id: "ID" }
// type def: $id: ID, arg: id: $id
```

The 3-arg form `$v(name,varName,type)` sets the variable name explicitly:

```js
$v("id","userID","ID")
// chunk: { id: { userID: "ID" } }
// type def: $userID: ID, arg: id: $userID
```

**NOTE:** Anywhere a type string appears — as long as it doesn't include non-identifier characters like `[` or `!` — a `$t` bare-name token is also accepted. For example: `$t.String`, `$t.DateTime`, `$t.ID`. This can help visually distinguish the type from the surrounding field/variable name strings:

```js
$v("id",$t.ID)
```

### `$t` — Bare-Name Tokens

`$t` is a proxy that produces bare-name tokens for use in literal-based argument positions.

```js
$t.DESC      // renders as: DESC
$t.UTC_NOW   // renders as: UTC_NOW
$t.String    // renders as: String  (usable as a type string)
```

A leading `$` on the property name marks it as a manual variable reference (for use alongside `varDefs`):

```js
$t.$orderBy  // renders as: $orderBy
```

Bare tokens can appear anywhere a literal value is expected — inside `litArgs`, as type strings in `$v` / variable specs, etc.

### `$m` — Map Literals

`$m` builds object structures, useful in places where the literal data shape would otherwise require object-literal syntax.

The 2-arg form `$m(name,value)` produces a single-property object:

```js
$m("order",$t.DESC)
// chunk: { order: $t.DESC }
// arg: order: DESC

$m("foo",42)
// chunk: { foo: 42 }
// arg: foo: 42
```

Nesting requires explicit `$m` calls per level:

```js
$m("order",
    $m("title",$t.DESC)
)
// chunk: { order: { title: $t.DESC } }
// arg: order: { title: DESC }
```

Multiple chunk-objects as trailing args merge as siblings under the named property:

```js
$m("order",
    $m("title",$t.DESC),
    $m("year",$t.ASC)
)
// chunk: { order: { title: $t.DESC, year: $t.ASC } }
// args: order: { title: DESC, year: ASC }
```

`$m` also accepts an `$f` token (or its symbol) as the property-name, mirroring the `[$f`...`]` computed-property syntax, for selection-set entries:

```js
selectionSet(
    $m(
        $f`recentPosts``posts ${ /* .. */ }`,
        [ "title", "publishedAt" ]
    )
)
```

is equivalent to:

```js
selectionSet: {
    [ $f`recentPosts``posts ${ /* .. */ }` ]:
        [ "title", "publishedAt" ]
}
```

### `$f` — Field-Level References

`$f` produces field-level reference tokens for use in `selectionSet(..)`. It supports field aliases, field-level arguments, and pairs with `$m` for sub-selections.

`$f` supports two equivalent calling styles. The tagged-template form is JS-specific and reads closer to GraphQL's own alias syntax. The function-call form is conventional JS and is the basis for ports to other languages (Go, Rust, etc.).

Both forms produce identical tokens and work interchangeably in all positions: `selectionSet(..)`, computed property keys (`{ [$f(...)]: subSel }`), and `$m(..)`.

**Signatures:**

```js
// tag form
$f`fieldName`
$f`alias``fieldName`
$f`fieldName ${combinator}`
$f`alias``fieldName ${combinator}`

// function-call form
$f("fieldName")
$f("alias", "fieldName")
$f("fieldName", combinator)
$f("alias", "fieldName", combinator)
```

**Side by side:**

```js
// alias only
$f`ownerEmail``email`
$f("ownerEmail", "email")

// field with args, no alias
$f`posts ${varArgs($v("since","DateTime"))}`
$f("posts", varArgs($v("since","DateTime")))

// alias + field + args
$f`myPosts``posts ${varArgs($v("since","DateTime"))}`
$f("myPosts", "posts", varArgs($v("since","DateTime")))
```

The choice between forms is purely stylistic. The tag form is more compact and reads left-to-right as `alias: field` — matching GraphQL's own rendering. The function-call form is immediately readable to anyone familiar with conventional JS and maps directly to how other language ports express the same concept.

### Field-Level Selections

To alias a field name in a selection-set:

```js
selectionSet(
    // ..
    $f`userFirstName``firstName`,
    // ..
)
```

Produces a field-level reference like `userFirstName: firstName`, which aliases the `firstName` field name to `userFirstName` in the result set.

To use field-level arguments (and aliases, if desired) on an object field with sub-selection, pair the `$f` helper with `$m` to produce a computed-property selection-set entry. The `$f` interpolation accepts an array of chunks (merged together), so the option-key helpers and other chunk producers compose naturally inside it:

```js
selectionSet(
    // ..
    $m(
        $f`myPosts``posts ${[
            varArgs($v("since","DateTime")),
            litArgs($m("limit",50))
        ]}`,
        [ "title", "publishedAt" ]
    )
    // ..
)
```

**NOTE:** The `[ ]` surrounding the interpolation expression is there to allow the two argument-bearing values. If there's only one value being interpolated, you can pass it directly without the `[ ]` around it.

The `$f` interpolation also accepts a single object literal directly, equivalent to the array-of-chunks form above:

```js
selectionSet(
    // ..
    $m(
        $f`myPosts``posts ${{
            varArgs: { since: "DateTime" },
            litArgs: { limit: 50 }
        }}`,
        [ "title", "publishedAt" ]
    )
)
```

Either form above produces this field-level reference with sub-selection:

```graphql
myPosts: posts(since: $since, limit: 50) {
    title
    publishedAt
}
```

## Query Result Object

`queryBuilder(..)` returns a result object with the following properties:

* `text`: the ready-to-execute query text

* `operationName`: the operation name embedded in the query text (e.g., `GetUser`), to pass along to whatever GraphQL endpoint will execute the query

* `resultName`: the result set name (e.g., the root field's alias if one was set, otherwise its bare field name)

For example, this call:

```js
queryBuilder(
    { operationName: "GetUser" },
    root("user"),
    varArgs($v("id","ID")),
    selectionSet("firstName","lastName")
)
```

Produces:

```js
{
    text: "query GetUser($id:ID) { user(id:$id) { firstName lastName } }",
    operationName: "GetUser",
    resultName: "user",
}
```

## Other Exports

* `isGQLName(str)`: predicate; returns `true` if `str` is a valid GraphQL name (per the spec's identifier grammar). Useful for validating dynamically-supplied field or alias names before passing them to the builder.

## Extending Composer

Composer is built to be extended. Higher-level layers — backend-flavored DSLs, opinionated query helpers, transport-coupled clients — can register against composer's internals to add new syntax, new combinators, and new rendering behavior, without composer itself needing to know about any of it.

This package also ships an abstract DB-shaped layer (`@gql-x/composer/db`) that sits between bare composer and a fully-realized backend-specific package. It adds auto-prefixing of schema names (handy for backends without native namespacing), a pluggable transport spread, and a `decorate` hook for layering on backend-specific helpers. It functions more like an interface or abstract base class than a finished tool — you wouldn't normally instantiate it directly. (You *could*, if schema-name prefixing is the one thing you wanted; nothing prevents it.) Its real audience is the package one layer up.

The extension points, the DB layer's full surface, and the render protocol that makes deep customization possible are all documented in [EXTENSIBILITY.md](./EXTENSIBILITY.md).

## Tests

A test suite is included in this repository, as well as the npm package distribution. The default test behavior runs the test suite using the files in `src/`.

To run the test suite:

```
npm test
```

## License

[![License](https://img.shields.io/badge/license-MIT-a1356a)](LICENSE.txt)

All code and documentation are (c) 2026 Kyle Simpson and released under the [MIT License](http://getify.mit-license.org/). A copy of the MIT License [is also included](LICENSE.txt).
