import { registerPlugin as composerRegisterPlugin, } from "./composer.js";


export { registerPlugin, };


// *****************************

var GQL_BUILTIN_TYPES = [
	"Int",
	"Float",
	"String",
	"Boolean",
	"ID",
];


// *****************************
// Transport contract:
//
// A transport is an object with whatever methods it chooses to expose.
// db.js projects all of those properties onto the prefixed API surface
// (spread via Object.assign). db.js does not introspect transport;
// presence of a method on a transport is the capability signal.
// *****************************

function registerPlugin({
	namePrefix = "",
	nonPrefixedTypes = null,
	transport = null,
	decorate = null,
} = {}) {
	var { api: composer, internals: composerInternals, } = composerRegisterPlugin();

	var dbNonPrefixedTypes = [
		...GQL_BUILTIN_TYPES,
		...(nonPrefixedTypes || []),
	];

	var api = prefix(namePrefix);

	var internals = {
		composer: composerInternals,
	};

	return { api, internals, };


	// ******************************

	function prefix(namePrefix) {
		var prefixedAPI = {
			prefix,
			query,
			...(transport || {}),
		};

		if (typeof decorate == "function") {
			prefixedAPI = decorate(prefixedAPI,composer,composerInternals);
		}

		return prefixedAPI;


		// ************************

		function query(...args) {
			// extract caller-supplied nonPrefixedTypes from chunks,
			// merge with db's list, pass the merged list down to QB.
			var callerNonPrefixed = extractNonPrefixed(args);
			var mergedNonPrefixed = [
				...dbNonPrefixedTypes,
				...callerNonPrefixed,
			];

			var dbQuery = composer.queryBuilder(
				{
					namePrefix,
					nonPrefixedTypes: mergedNonPrefixed,
				},
				...args
			);

			return decorateDBQuery(dbQuery);
		}
	}
}


// *****************************

function extractNonPrefixed(args) {
	var collected = [];

	for (var i = 0; i < args.length; i++) {
		var chunk = args[i];
		if (
			chunk &&
			typeof chunk == "object" &&
			!Array.isArray(chunk) &&
			Array.isArray(chunk.nonPrefixedTypes)
		) {
			collected.push(...chunk.nonPrefixedTypes);
			var { nonPrefixedTypes, ...rest } = chunk;
			args[i] = rest;
		}
	}

	return collected;
}

function decorateDBQuery(query) {
	// DBQuery functor:
	//   map(fn) — returns a new DBQuery whose payload is fn(query).
	//   tap(fn) — observes the query, returns the same DBQuery.
	query.map = function map(fn) {
		var next = fn(query);
		if (next == null) {
			throw new Error("DBQuery.map(fn): fn must return a query");
		}
		return decorateDBQuery(next);
	};

	query.tap = function tap(fn) {
		return query.map(function tapMap(q) {
			fn(q);
			return q;
		});
	};

	return query;
}
