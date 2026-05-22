import assert from "node:assert";
import { module } from "./runner.js";
import { createComposer, registerPlugin, isGQLName, } from "@gql-x/composer";

export const test = module("factory");


// ************************
// createComposer()
// ************************

test("createComposer() returns the public api surface", () => {
	var composer = createComposer();
	assert.deepEqual(
		Object.keys(composer).sort(),
		[
			"$f", "$m", "$t", "$v",
			"isGQLName",
			"litArgs",
			"queryBuilder",
			"root",
			"selectionSet",
			"varArgs", "varDefs",
		]
	);
});

test("createComposer() does not expose internals", () => {
	var composer = createComposer();
	assert.equal(composer.internals, undefined);
	assert.equal(composer.makeFieldToken, undefined);
	assert.equal(composer.$fMeta, undefined);
});


// ************************
// registerPlugin()
// ************************

test("registerPlugin() returns { api, internals }", () => {
	var reg = registerPlugin();
	assert.ok(!!reg.api, "has api");
	assert.ok(!!reg.internals, "has internals");
});

test("registerPlugin().api matches createComposer() shape", () => {
	var fromCreate = createComposer();
	var { api, } = registerPlugin();
	assert.deepEqual(
		Object.keys(api).sort(),
		Object.keys(fromCreate).sort()
	);
});

test("registerPlugin().internals exposes plugin hooks", () => {
	var { internals, } = registerPlugin();
	assert.equal(typeof internals.makeFieldToken, "function");
	assert.equal(typeof internals.is$fToken, "function");
	assert.equal(typeof internals.get$fSymbol, "function");
	assert.equal(typeof internals.nameToken, "function");
	assert.equal(typeof internals.is$tToken, "function");
	assert.equal(typeof internals.get$tTokenName, "function");
	assert.ok(internals.$fMeta instanceof WeakMap);
});


// ************************
// composer instance isolation
// ************************

test("two createComposer() calls produce independent instances", () => {
	var a = createComposer();
	var b = createComposer();
	assert.notEqual(a.$f, b.$f);
	assert.notEqual(a.$t, b.$t);
	assert.notEqual(a.queryBuilder, b.queryBuilder);
});

test("$f tokens minted by one composer are unknown to another", () => {
	var { api: apiA, internals: internalsA, } = registerPlugin();
	var { api: apiB, internals: internalsB, } = registerPlugin();

	var tokA = apiA.$f`field`;
	var symA = tokA[Symbol.toPrimitive]("default");

	// the symbol is registered in A's $fMeta, not B's
	assert.ok(internalsA.$fMeta.has(symA));
	assert.ok(!internalsB.$fMeta.has(symA));
});

test("$t tokens are not shared across composer instances", () => {
	var a = createComposer();
	var b = createComposer();
	assert.notEqual(a.$t.DESC, b.$t.DESC);
	assert.equal(String(a.$t.DESC), String(b.$t.DESC));
});


// ************************
// module-level isGQLName
// ************************

test("isGQLName exported at module level", () => {
	assert.equal(typeof isGQLName, "function");
	assert.equal(isGQLName("valid_name1"), true);
	assert.equal(isGQLName("123abc"), false);
	assert.equal(isGQLName("bad-name"), false);
	assert.equal(isGQLName(""), false);
});

test("isGQLName on composer api matches module-level", () => {
	var composer = createComposer();
	assert.equal(composer.isGQLName, isGQLName);
});
