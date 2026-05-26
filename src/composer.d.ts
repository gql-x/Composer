// ============================================================
// @gql-x/composer type definitions
// ============================================================

// ---------- Brand machinery (internal) ----------
declare const ClauseBrand: unique symbol;
declare const TokenBrand: unique symbol;

type Branded<K extends string> = { readonly [ClauseBrand]: K };

// ---------- Token types ----------
export type VarToken = {
	readonly [TokenBrand]: "var";
	name: string;
	varName: string;
	type: string;
};

export type NameToken = {
	readonly [TokenBrand]: "name";
	name: string;
};

export type VarRefToken = {
	readonly [TokenBrand]: "varref";
	varName: string;
};

export type MapToken = {
	readonly [TokenBrand]: "map";
	name: string;
	value: unknown;
};

export type FieldToken = {
	readonly [TokenBrand]: "field";
	alias?: string;
	field: string;
	meta?: unknown;
};

// ---------- Value types (what goes inside clauses) ----------
export type Arg =
	| VarToken | NameToken | VarRefToken | MapToken | FieldToken
	| string | number | boolean | null
	| { [key: string]: Arg }
	| readonly Arg[];

export type TypedParam = VarToken;

export type SelectionField =
	| string
	| FieldToken
	| NameToken
	| VarRefToken
	| { [field: string]: SelectionField[] | null };

// ---------- Clause types ----------
export type OperationNameClause = Branded<"operationName"> & {
	operationName: string;
};

export type RootClause = Branded<"root"> & {
	root: { field: string; alias?: string | null };
};

export type VarArgsClause = Branded<"varArgs"> & {
	varArgs: Record<string, Arg>;
};

export type LitArgsClause = Branded<"litArgs"> & {
	litArgs: Record<string, Arg>;
};

export type VarDefsClause = Branded<"varDefs"> & {
	varDefs: Record<string, TypedParam>;
};

export type SelectionSetClause = Branded<"selectionSet"> & {
	selectionSet: readonly SelectionField[] | null;
};

export type KindClause = Branded<"kind"> & {
	kind: "query" | "mutation" | "subscription";
};

// Strict union — what helpers return
export type Clause =
	| OperationNameClause
	| RootClause
	| VarArgsClause
	| LitArgsClause
	| VarDefsClause
	| SelectionSetClause
	| KindClause;

// Structural escape hatch — same shapes without brands
export type ClauseShape =
	| { operationName: string }
	| { root: { field: string; alias?: string | null } }
	| { varArgs: Record<string, Arg> }
	| { litArgs: Record<string, Arg> }
	| { varDefs: Record<string, TypedParam> }
	| { selectionSet: readonly SelectionField[] | null }
	| { kind: "query" | "mutation" | "subscription" };

// ---------- Result types ----------
export type QueryResult = {
	text: string;
	opName: string | null;
	resName: string;
	kind: "query" | "mutation" | "subscription";
};

export type InvalidQueryResult = {
	readonly __error: "Query is missing required root field";
};

// ---------- Conditional result machinery ----------
type HasClause<T extends readonly Clause[], C> =
	Extract<T[number], C> extends never ? false : true;

type ResultFor<T extends readonly Clause[]> =
	HasClause<T, RootClause> extends true ? QueryResult : InvalidQueryResult;

// ---------- $t proxy ----------
export type TProxy = {
	readonly [key: `$${string}`]: VarRefToken;
	readonly [key: string]: NameToken | VarRefToken;
};

// ---------- Args/varDefs input constraints ----------
type ArgsInput = MapToken | { [key: string]: Arg };
type VarDefsInput = VarToken | { [key: string]: TypedParam };

// ---------- $f interpolation constraints ----------
type NonEmptyClauseArray = readonly [Clause | ClauseShape, ...(Clause | ClauseShape)[]];
type FieldInterpolation = NonEmptyClauseArray | ClauseShape;

// ---------- Helper function declarations ----------
export function $v(name: string, type: string): VarToken;
export function $v(name: string, varName: string, type: string): VarToken;

export function $m(name: string, value: unknown): MapToken;

export function $f(alias: string | null, field: string, combinator?: unknown): FieldToken;
export function $f(
	strings: TemplateStringsArray,
	...values: FieldInterpolation[]
): FieldToken & ((strings: TemplateStringsArray, ...values: FieldInterpolation[]) => FieldToken);

export function operationName(name: string): OperationNameClause;
export function root(field: string, alias?: string | null): RootClause;

export function varArgs(...args: ArgsInput[]): VarArgsClause;
export function litArgs(...args: ArgsInput[]): LitArgsClause;
export function varDefs(...args: VarDefsInput[]): VarDefsClause;

export function selectionSet(...fields: SelectionField[]): SelectionSetClause;
export function selectionSet(none: null): SelectionSetClause;
export namespace selectionSet {
	function none(): SelectionSetClause;
}

export function isGQLName(name: unknown): boolean;

// ---------- Entry points (strict + structural overloads) ----------
export function raw<T extends readonly Clause[]>(...clauses: T): ResultFor<T>;
export function raw(...clauses: ClauseShape[]): QueryResult;

export function query<T extends readonly Clause[]>(...clauses: T): ResultFor<T>;
export function query(...clauses: ClauseShape[]): QueryResult;

export function mutation<T extends readonly Clause[]>(...clauses: T): ResultFor<T>;
export function mutation(...clauses: ClauseShape[]): QueryResult;

export function subscription<T extends readonly Clause[]>(...clauses: T): ResultFor<T>;
export function subscription(...clauses: ClauseShape[]): QueryResult;

// ---------- Composer shape ----------
export type Composer = {
	$f: typeof $f;
	$t: TProxy;
	$v: typeof $v;
	$m: typeof $m;
	varArgs: typeof varArgs;
	litArgs: typeof litArgs;
	varDefs: typeof varDefs;
	operationName: typeof operationName;
	selectionSet: typeof selectionSet;
	root: typeof root;
	raw: typeof raw;
	query: typeof query;
	mutation: typeof mutation;
	subscription: typeof subscription;
	isGQLName: typeof isGQLName;
};

// ---------- Plugin-author entry point ----------
export type ComposerInternals = {
	makeFieldToken: (...args: unknown[]) => FieldToken;
	[key: string]: unknown;
};

export type RegisterPluginOptions = {
	decorate?: (
		api: Composer,
		composer: Composer,
		internals: ComposerInternals
	) => Composer;
};

export type RegisterPluginResult = {
	api: Composer;
	_internals: ComposerInternals;
};

// ---------- Top-level exports ----------
export function createComposer(): Composer;
export function registerPlugin(opts?: RegisterPluginOptions): RegisterPluginResult;
