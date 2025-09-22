const js = require("@eslint/js");
const { defineConfig } = require("eslint/config");
const stylistic = require("@stylistic/eslint-plugin");

module.exports = defineConfig([
    {
        files: ["**/*.js"],
        plugins: {
            js,
            '@stylistic': stylistic
        },
        extends: ["js/recommended"],
        languageOptions: {
            globals: {
                ARGV: "readonly",
                Debugger: "readonly",
                GIRepositoryGType: "readonly",
                global: "readonly",
                globalThis: "readonly",
                imports: "readonly",
                Intl: "readonly",
                log: "readonly",
                logError: "readonly",
                print: "readonly",
                printerr: "readonly",
                window: "readonly",
                TextEncoder: "readonly",
                TextDecoder: "readonly",
                console: "readonly",
                setTimeout: "readonly",
                setInterval: "readonly",
                clearTimeout: "readonly",
                clearInterval: "readonly"
            }
        },
        rules: {
            '@stylistic/array-bracket-newline': ["error", "consistent"],
            '@stylistic/array-bracket-spacing': ["error", "never"],
            'array-callback-return': ["error"],
            '@stylistic/arrow-parens': ["error", "always"],
            '@stylistic/arrow-spacing': ["error"],
            'block-scoped-var' : ["error"],
            '@stylistic/block-spacing': ["error"],
            '@stylistic/brace-style': ["error"],
            'camelcase': ["error", {"properties": "never", "allow": ["^vfunc_", "^on_"]}],
            '@stylistic/comma-dangle': ["error", "never"],
            '@stylistic/comma-spacing': ["error", {
                "before": false,
                "after": true
            }],
            '@stylistic/comma-style': ["error", "last"],
            '@stylistic/computed-property-spacing': ["error"],
            'curly': ["error", "all"],
            '@stylistic/dot-location': ["error", "property"],
            '@stylistic/eol-last': ["error"],
            'eqeqeq': ["error"],
            '@stylistic/eol-last': ["error"],
            '@stylistic/function-call-spacing': ["error"],
            'func-name-matching': ["error"],
            'func-style': ["error", "declaration", {"allowArrowFunctions": true}],
            '@stylistic/indent': ["error", 4, {
                 /*
                    Allow not indenting the body of GObject.registerClass, since in the
                    future it's intended to be a decorator
                 */
                "ignoredNodes": ["CallExpression[callee.object.name=GObject][callee.property.name=registerClass] > ClassExpression:first-child"],
                "MemberExpression": "off"
            }],
            '@stylistic/key-spacing': ["error", {
                "beforeColon": false,
                "afterColon": true
            }],
            '@stylistic/keyword-spacing': ["error", {
                "before": true,
                "after": true
            }],
            '@stylistic/linebreak-style': ["error", "unix"],
            '@stylistic/lines-between-class-members': ["error", "always", {
                "exceptAfterSingleLine": true
            }],
            'max-nested-callbacks': ["error"],
            '@stylistic/max-statements-per-line': ["error"],
            '@stylistic/new-parens': ["error"],
            'no-array-constructor': ["error"],
            'no-await-in-loop': ["error"],
            'no-constant-condition': ["error", {"checkLoops": false}],
            'no-div-regex': ["error"],
            'no-empty': ["error", {"allowEmptyCatch": true}],
            'no-extra-bind': ["error"],
            'no-extra-parens': ["error", "all", {
                "conditionalAssign": false,
                "nestedBinaryExpressions": false,
                "returnAssign": false
            }],
            'no-implicit-coercion': ["error", {"allow": ["!!"]}],
            'no-invalid-this': ["error"],
            'no-iterator': ["error"],
            'no-label-var': ["error"],
            'no-lonely-if': ["error"],
            'no-loop-func': ["error"],
            'no-nested-ternary': ["error"],
            'no-new-object': ["error"],
            'no-new-wrappers': ["error"],
            'no-octal-escape': ["error"],
            'no-proto': ["error"],
            'no-prototype-builtins': ["off"],
            'no-restricted-globals': ["error", "window"],
            'no-restricted-properties': ["error",
              {
                  "object": "imports",
                  "property": "format",
                  "message": "Use template strings"
              }, {
                  "object": "pkg",
                  "property": "initFormat",
                  "message": "Use template strings"
              }, {
                  "object": "Lang",
                  "property": "copyProperties",
                  "message": "Use Object.assign()"
              }, {
                  "object": "Lang",
                  "property": "bind",
                  "message": "Use arrow notation or Function.prototype.bind()"
              }, {
                  "object": "Lang",
                  "property": "Class",
                  "message": "Use ES6 classes"
              }
            ],
            'no-return-assign': ["error"],
            'no-return-await': ["error"],
            'no-self-compare': ["error"],
            'no-shadow': ["error"],
            'no-shadow-restricted-names': ["error"],
            'no-spaced-func': ["error"],
            'no-tabs': ["error"],
            'no-template-curly-in-string': ["error"],
            'no-throw-literal': ["error"],
            'no-trailing-spaces': ["error"],
            'no-undef-init': ["error"],
            'no-unneeded-ternary': ["error"],
            'no-unused-expressions': ["error"],
            'no-unused-vars': ["error", {
                "varsIgnorePattern": "(^unused|_$)",
                "argsIgnorePattern": "^(unused|_)"
            }],
            'no-useless-call': ["error"],
            'no-useless-computed-key': ["error"],
            'no-useless-concat': ["error"],
            'no-useless-constructor': ["error"],
            'no-useless-rename': ["error"],
            'no-useless-return': ["error"],
            'no-whitespace-before-property': ["error"],
            'no-with': ["error"],
            'nonblock-statement-body-position': ["error", "below"],
            'object-curly-newline': ["error", {
                "consistent": true,
                "multiline": true
            }],
            'object-curly-spacing': ["error", "always"],
            'object-shorthand': ["error"],
            'operator-assignment': ["error"],
            'operator-linebreak': ["error"],
            'padded-blocks': ["error", "never"],
            'prefer-arrow-callback': ["error"],
            'prefer-const': ["error"],
            'prefer-destructuring': ["error"],
            'prefer-numeric-literals': ["error"],
            'prefer-promise-reject-errors': ["error"],
            'prefer-rest-params': ["error"],
            'prefer-spread': ["error"],
            'prefer-template': ["off"],
            'quotes': ["error", "single", {"avoidEscape": true}],
            'require-await': ["error"],
            'rest-spread-spacing': ["error"],
            'semi': ["error", "always"],
            'semi-spacing': ["error", {
                "before": false,
                "after": true
            }],
            'semi-style': ["error"],
            'space-before-blocks': ["error"],
            'space-before-function-paren': ["error", {
                "named": "never",
                "anonymous": "always",
                "asyncArrow": "always"
            }],
            'space-in-parens': ["error"],
            'space-infix-ops': ["error", {"int32Hint": false}],
            'space-unary-ops': ["error"],
            'spaced-comment': ["error"],
            'switch-colon-spacing': ["error"],
            'symbol-description': ["error"],
            'template-curly-spacing': ["error"],
            'template-tag-spacing': ["error"],
            'unicode-bom': ["error"],
            'wrap-iife': ["error", "inside"],
            'yield-star-spacing': ["error"],
            'yoda': ["error"],
        }
    }
]);
