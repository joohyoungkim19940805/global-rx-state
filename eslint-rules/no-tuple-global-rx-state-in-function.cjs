/**
 * Disallows anonymous tuple-mode stores inside functions/components.
 *
 * Anonymous tuple mode creates a new store for each call and is intended for
 * module top-level declarations that are exported and imported by components.
 * Use named mode or the named tuple helpers when a store must be created from a
 * function scope.
 */
module.exports = {
	meta: {
		type: "problem",
		docs: {
			description:
				"Disallow anonymous tuple-mode createRxState/createRxReducer inside functions/components.",
		},
		schema: [],
		messages: {
			noTupleInFn:
				"Anonymous tuple mode {{name}} must be used at module top-level only. Use named mode or a named tuple helper instead.",
		},
	},
	create(context) {
		function isFunctionLike(node) {
			return (
				node.type === "FunctionDeclaration" ||
				node.type === "FunctionExpression" ||
				node.type === "ArrowFunctionExpression"
			);
		}

		function isTargetAnonymousTupleCall(node) {
			if (!node.callee || node.callee.type !== "Identifier") {
				return false;
			}

			if (node.callee.name === "createRxState") {
				return node.arguments.length === 1;
			}

			if (node.callee.name === "createRxReducer") {
				return node.arguments.length === 2;
			}

			return false;
		}

		return {
			CallExpression(node) {
				if (!isTargetAnonymousTupleCall(node)) {
					return;
				}

				const ancestors = context.getAncestors();
				const inFunction = ancestors.some(isFunctionLike);

				if (!inFunction) {
					return;
				}

				context.report({
					node,
					messageId: "noTupleInFn",
					data: {
						name: node.callee.name,
					},
				});
			},
		};
	},
};
