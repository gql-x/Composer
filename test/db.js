import assert from "node:assert";
import { module } from "./runner.js";
import { registerPlugin, } from "@gql-x/composer/db";

export const test = module("db");

function normalize(str) {
	return str.replace(/\s+/g, " ").trim();
}

test("registerPlugin() returns the right shape", () => {
	var reg = registerPlugin({ namePrefix: "Dev_", });
	assert.ok(!!reg.api,"has api");
	assert.deepEqual(Object.keys(reg.api),[ "prefix", "query" ],"has api methods");
	assert.ok(!!reg.internals,"has internals");
	assert.ok(!!(reg.internals && reg.internals.composer),"has composer internals");
});

test("api.query() with plain-string selection", () => {
	var { api } = registerPlugin();
	var { text, operationName, resultName } = api.query({
		root: { field: "User" },
		operationName: null,
		selectionSet: [ "name","email" ]
	});
	assert.equal(resultName, "User");
	assert.equal(normalize(text),"query { User { name email } }");
});

test("api.query() with namePrefix applied", () => {
	var { api } = registerPlugin({ namePrefix: "Dev_", });
	var { text, operationName, resultName } = api.query({
		root: { field: "User" },
		operationName: null,
		selectionSet: [ "name","email" ]
	});
	assert.equal(resultName, "User");
	assert.equal(normalize(text),"query { User: Dev_User { name email } }");
});

test("api.query() with caller-passed nonPrefixedTypes merging", () => {
	var { api } = registerPlugin({ namePrefix: "Dev_", });
	var { text, operationName, resultName } = api.query({
		nonPrefixedTypes: [ "User" ],
		root: { field: "User" },
		operationName: null,
		selectionSet: [ "name","email" ]
	});
	assert.equal(resultName, "User");
	assert.equal(normalize(text),"query { User { name email } }");
});

test("api.prefix() returns a sibling API with different prefix", () => {
	var { api } = registerPlugin({ namePrefix: "Dev_", });
	var otherApi = api.prefix("v2_");
	var { text, operationName, resultName } = otherApi.query({
		root: { field: "User" },
		operationName: null,
		selectionSet: [ "name","email" ]
	});
	assert.equal(resultName, "User");
	assert.equal(normalize(text),"query { User: v2_User { name email } }");
});

test("original api's prefix unchanged after re-prefix", () => {
	var { api } = registerPlugin({ namePrefix: "Dev_", });
	var otherApi = api.prefix("v2_");
	var { text, operationName, resultName } = api.query({
		root: { field: "User" },
		operationName: null,
		selectionSet: [ "name","email" ]
	});
	assert.equal(resultName, "User");
	assert.equal(normalize(text),"query { User: Dev_User { name email } }");
});

test("transport methods included in api", () => {
	var fakeTransport = {
		exec() { return null; },
		hasActiveTransaction() { return false; },
	};
	var { api: apiWithTransport } = registerPlugin({
		transport: fakeTransport
	});
	assert.deepEqual(Object.keys(apiWithTransport),[ "prefix", "query", "exec", "hasActiveTransaction" ],"transport api methods");
	assert.equal(typeof apiWithTransport.exec,"function","exec() function");
	assert.equal(typeof apiWithTransport.hasActiveTransaction,"function","hasActiveTransaction() function");
});

test("transport.exec() callable", () => {
	var fakeTransport = {
		exec({ text, vars, operationName, } = {}) {
			return { __mock: true, text, };
		},
	};
	var { api: apiWithTransport } = registerPlugin({
		transport: fakeTransport
	});
	var { __mock: mockResult, text: mockText, } = apiWithTransport.exec({
		text: "query Foo { x }",
	});
	assert.ok(mockResult,"exec() called");
	assert.equal(mockText,"query Foo { x }");
});

test("query().tap() callable", () => {
	var { api } = registerPlugin();
	var tappedText = null;
	var { text } = (
		api.query({
			root: { field: "User" },
			operationName: null,
			selectionSet: [ "name","email" ]
		})
		.tap(qr => { tappedText = qr.text; })
	);
	assert.equal(text,tappedText,"tap() called, text matched");
});

test("query().map() callable", () => {
	var { api } = registerPlugin();
	var { text } = (
		api.query({
			root: { field: "User" },
			operationName: null,
			selectionSet: [ "name","email" ]
		})
		.map(qr => ({
			...qr,
			text: qr.text.toUpperCase()
		}))
	);
	assert.equal(normalize(text),"QUERY { USER { NAME EMAIL } }","map() called, text transformed");
});

test("decorate() plugin callback", () => {
	var origAPI = null;
	var origComposer = null;
	var origComposerInternals = null;
	var { api: decoratedApi, } = registerPlugin({
		decorate(api,composer,composerInternals) {
			origAPI = api;
			origComposer = composer;
			origComposerInternals = composerInternals;
			api.decorated = () => "decorated!";
			return api;
		}
	});
	assert.ok(!!origAPI,"api passed to decorate()");
	assert.ok(!!origComposer,"composer passed to decorate()");
	assert.ok(!!origComposerInternals,"composer internals passed to decorate()");
	assert.equal(origAPI,decoratedApi,"original api can be decorated");
	assert.equal(decoratedApi.decorated(),"decorated!","decorated() method callable");
});

test("GQL builtin type not prefixed in varDefs", () => {
	var { api } = registerPlugin({ namePrefix: "Dev_", });
	var { text, } = api.query({
		root: { field: "User" },
		operationName: "User",
		varDefs: { limit: "Int" },
		selectionSet: [ "name" ],
	});
	assert.ok(text.includes("$limit:Int"));
	assert.ok(!text.includes("Dev_Int"));
});
