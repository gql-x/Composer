// ============================================================
// @gql-x/composer/db type definitions
// ============================================================

import type {
	Composer,
	ComposerInternals,
	QueryResult,
	Clause,
	ClauseShape,
	RootClause,
} from "./composer.js";

// ---------- DBQuery functor ----------
// decorateDBQuery augments the query object in place with .map/.tap;
// expressed as an intersection rather than a wrapper type.
export type DBQuery<R extends object = QueryResult> = R & {
	map<U extends object>(fn: (result: R) => U): DBQuery<U>;
	tap(fn: (result: R) => void): DBQuery<R>;
};

// ---------- DB-layer chunk additions ----------
// The DB layer accepts an extra chunk shape on entry points carrying
// caller-supplied nonPrefixedTypes. Extracted before forwarding to composer.
export type NonPrefixedTypesClause = {
	nonPrefixedTypes: readonly string[];
};

// Entry-point clauses at the DB layer: composer clauses plus the DB-layer extras.
type DBClause = Clause | NonPrefixedTypesClause;
type DBClauseShape = ClauseShape | NonPrefixedTypesClause;

// ---------- Conditional result (carries through from composer) ----------
type DBHasClause<T extends readonly DBClause[], C> =
	Extract<T[number], C> extends never ? false : true;

type DBResultFor<T extends readonly DBClause[]> =
	DBHasClause<T, RootClause> extends true ? QueryResult : { readonly __error: "Query is missing required root field" };

// ---------- The wrapped entry point shape ----------
// Each wrapped entry point on the DB layer returns DBQuery<ResultFor<T>>.
type DBEntryPoint = {
	<T extends readonly DBClause[]>(...clauses: T): DBQuery<DBResultFor<T>>;
	(...clauses: DBClauseShape[]): DBQuery<QueryResult>;
};

// ---------- The DB composer surface ----------
// Generic over transport shape T and decorator return shape D.
// D defaults to a baseline DB API (no extra helpers); plugins override.
export type DBComposerBase = {
	prefix(namePrefix: string): DBComposerBase;
	raw: DBEntryPoint;
	query: DBEntryPoint;
	mutation: DBEntryPoint;
	subscription: DBEntryPoint;
};

export type DBComposer
	T extends Record<string, unknown> = {},
	D extends DBComposerBase = DBComposerBase
> = D & T;

// ---------- DB internals ----------
export type DBInternals = {
	composer: ComposerInternals;
};

// ---------- registerPlugin options ----------
export type DBRegisterPluginOptions
	T extends Record<string, unknown> = {},
	D extends DBComposerBase = DBComposerBase
> = {
	namePrefix?: string;
	nonPrefixedTypes?: readonly string[] | null;
	transport?: T | null;
	decorate?:
		| ((api: DBComposerBase & T, composer: Composer, internals: ComposerInternals) => D)
		| null;
};

export type DBRegisterPluginResult
	T extends Record<string, unknown> = {},
	D extends DBComposerBase = DBComposerBase
> = {
	api: DBComposer<T, D>;
	_internals: DBInternals;
};

// ---------- Entry point ----------
export function registerPlugin
	T extends Record<string, unknown> = {},
	D extends DBComposerBase = DBComposerBase
>(opts?: DBRegisterPluginOptions<T, D>): DBRegisterPluginResult<T, D>;
