// Unit tests for importParser module - Python import parsing

import * as assert from 'assert';
import { parsePythonImports } from '../../../src/parsers/importParser';

suite('importParser', () => {

  suite('parsePythonImports', () => {

    test('test_parseFromImport - extracts from X import Y statements', () => {
      const content = 'from mymodule import dostuff';
      const imports = parsePythonImports(content);

      assert.strictEqual(imports.length, 1);
      assert.strictEqual(imports[0].modulePath, 'mymodule');
      assert.deepStrictEqual(imports[0].importedNames, ['dostuff']);
      assert.strictEqual(imports[0].isRelative, false);
      assert.strictEqual(imports[0].relativeDots, 0);
      assert.strictEqual(imports[0].lineNo, 0);
    });

    test('test_parseImport - extracts import X statements', () => {
      const content = 'import mymodule';
      const imports = parsePythonImports(content);

      assert.strictEqual(imports.length, 1);
      assert.strictEqual(imports[0].modulePath, 'mymodule');
      assert.deepStrictEqual(imports[0].importedNames, ['mymodule']);
      assert.strictEqual(imports[0].isRelative, false);
      assert.strictEqual(imports[0].relativeDots, 0);
      assert.strictEqual(imports[0].lineNo, 0);
    });

    test('test_parseImportWithAlias - handles import X as Y', () => {
      const content = 'import mymodule as mm';
      const imports = parsePythonImports(content);

      assert.strictEqual(imports.length, 1);
      assert.strictEqual(imports[0].modulePath, 'mymodule');
      assert.deepStrictEqual(imports[0].importedNames, ['mm']);
      assert.strictEqual(imports[0].isRelative, false);
    });

    test('test_parseImportWithAlias - handles from X import Y as Z', () => {
      const content = 'from mymodule import dostuff as do_stuff';
      const imports = parsePythonImports(content);

      assert.strictEqual(imports.length, 1);
      assert.strictEqual(imports[0].modulePath, 'mymodule');
      assert.deepStrictEqual(imports[0].importedNames, ['do_stuff']);
      assert.strictEqual(imports[0].isRelative, false);
    });

    test('test_parseRelativeImport - handles from .module import x', () => {
      const content = 'from .mymodule import dostuff';
      const imports = parsePythonImports(content);

      assert.strictEqual(imports.length, 1);
      assert.strictEqual(imports[0].modulePath, '.mymodule');
      assert.deepStrictEqual(imports[0].importedNames, ['dostuff']);
      assert.strictEqual(imports[0].isRelative, true);
      assert.strictEqual(imports[0].relativeDots, 1);
    });

    test('test_parseRelativeImport - handles from ..module import x', () => {
      const content = 'from ..mymodule import dostuff';
      const imports = parsePythonImports(content);

      assert.strictEqual(imports.length, 1);
      assert.strictEqual(imports[0].modulePath, '..mymodule');
      assert.deepStrictEqual(imports[0].importedNames, ['dostuff']);
      assert.strictEqual(imports[0].isRelative, true);
      assert.strictEqual(imports[0].relativeDots, 2);
    });

    test('test_parseRelativeImport - handles from . import something', () => {
      const content = 'from . import dostuff';
      const imports = parsePythonImports(content);

      assert.strictEqual(imports.length, 1);
      assert.strictEqual(imports[0].modulePath, '.');
      assert.deepStrictEqual(imports[0].importedNames, ['dostuff']);
      assert.strictEqual(imports[0].isRelative, true);
      assert.strictEqual(imports[0].relativeDots, 1);
    });

    test('test_parseMultipleImports - extracts multiple imports with names', () => {
      const content = 'from mymodule import dostuff, otherthing';
      const imports = parsePythonImports(content);

      assert.strictEqual(imports.length, 1);
      assert.strictEqual(imports[0].modulePath, 'mymodule');
      assert.deepStrictEqual(imports[0].importedNames, ['dostuff', 'otherthing']);
      assert.strictEqual(imports[0].isRelative, false);
    });

    test('test_parseMultipleImports - with aliases', () => {
      const content = 'from mymodule import dostuff as do_stuff, otherthing as other';
      const imports = parsePythonImports(content);

      assert.strictEqual(imports.length, 1);
      assert.strictEqual(imports[0].modulePath, 'mymodule');
      assert.deepStrictEqual(imports[0].importedNames, ['do_stuff', 'other']);
    });

    test('test_parseMultilineImportsParens - handles imports in parentheses', () => {
      const content = `from mymodule import (
    dostuff,
    otherthing
)`;
      const imports = parsePythonImports(content);

      assert.strictEqual(imports.length, 1);
      assert.strictEqual(imports[0].modulePath, 'mymodule');
      assert.deepStrictEqual(imports[0].importedNames, ['dostuff', 'otherthing']);
      assert.strictEqual(imports[0].lineNo, 0);
    });

    test('test_parseMultilineImportsParens - with trailing comma', () => {
      const content = `from mymodule import (
    dostuff,
    otherthing,
)`;
      const imports = parsePythonImports(content);

      assert.strictEqual(imports.length, 1);
      assert.strictEqual(imports[0].modulePath, 'mymodule');
      assert.deepStrictEqual(imports[0].importedNames, ['dostuff', 'otherthing']);
    });

    test('test_parseMultilineImportsBackslash - handles backslash continuation', () => {
      const content = `from mymodule import dostuff, \\
    otherthing`;
      const imports = parsePythonImports(content);

      assert.strictEqual(imports.length, 1);
      assert.strictEqual(imports[0].modulePath, 'mymodule');
      assert.deepStrictEqual(imports[0].importedNames, ['dostuff', 'otherthing']);
    });

    test('test_ignoreCommentedImports - skips # from module import x', () => {
      const content = `# from mymodule import dostuff
import another`;
      const imports = parsePythonImports(content);

      assert.strictEqual(imports.length, 1);
      assert.strictEqual(imports[0].modulePath, 'another');
    });

    test('test_ignoreBehaveImports - skips from behave import *', () => {
      const content = `from behave import *
from mymodule import dostuff`;
      const imports = parsePythonImports(content);

      assert.strictEqual(imports.length, 1);
      assert.strictEqual(imports[0].modulePath, 'mymodule');
    });

    test('test_ignoreBehaveImports - skips import behave', () => {
      const content = `import behave
from mymodule import dostuff`;
      const imports = parsePythonImports(content);

      assert.strictEqual(imports.length, 1);
      assert.strictEqual(imports[0].modulePath, 'mymodule');
    });

    test('test_ignoreBehaveImports - skips import behave with alias', () => {
      const content = `import behave as bh
from mymodule import dostuff`;
      const imports = parsePythonImports(content);

      assert.strictEqual(imports.length, 1);
      assert.strictEqual(imports[0].modulePath, 'mymodule');
    });

    test('test_ignoreBehaveImports - skips from behave import step, given, when, then', () => {
      const content = `from behave import step, given, when, then
from mymodule import dostuff`;
      const imports = parsePythonImports(content);

      assert.strictEqual(imports.length, 1);
      assert.strictEqual(imports[0].modulePath, 'mymodule');
    });

    test('test_parseMultipleImports - correctly handles file with multiple import types', () => {
      const content = `import os
from pathlib import Path
from mymodule import dostuff
from .relative import thing`;
      const imports = parsePythonImports(content);

      assert.strictEqual(imports.length, 4);
      assert.strictEqual(imports[0].modulePath, 'os');
      assert.strictEqual(imports[1].modulePath, 'pathlib');
      assert.strictEqual(imports[2].modulePath, 'mymodule');
      assert.strictEqual(imports[3].modulePath, '.relative');
    });

    test('test_parseMultilineImportsParens - complex mix', () => {
      const content = `from steps.grouped import (
    outline_feature_steps,
    table_feature_steps,
)`;
      const imports = parsePythonImports(content);

      assert.strictEqual(imports.length, 1);
      assert.strictEqual(imports[0].modulePath, 'steps.grouped');
      assert.deepStrictEqual(imports[0].importedNames, ['outline_feature_steps', 'table_feature_steps']);
    });

    test('test_emptyContent - returns empty array for empty string', () => {
      const content = '';
      const imports = parsePythonImports(content);

      assert.strictEqual(imports.length, 0);
      assert.deepStrictEqual(imports, []);
    });

    test('test_emptyContent - returns empty array for whitespace only', () => {
      const content = '   \n  \n   ';
      const imports = parsePythonImports(content);

      assert.strictEqual(imports.length, 0);
    });

    test('test_emptyContent - returns empty array for comments only', () => {
      const content = `# This is a comment
# from foo import bar`;
      const imports = parsePythonImports(content);

      assert.strictEqual(imports.length, 0);
    });

    test('should handle nested module paths', () => {
      const content = 'from features.grouped.steps import outline_feature_steps';
      const imports = parsePythonImports(content);

      assert.strictEqual(imports.length, 1);
      assert.strictEqual(imports[0].modulePath, 'features.grouped.steps');
      assert.deepStrictEqual(imports[0].importedNames, ['outline_feature_steps']);
    });

    test('should track line numbers correctly', () => {
      const content = `import os

from mymodule import dostuff`;
      const imports = parsePythonImports(content);

      assert.strictEqual(imports.length, 2);
      assert.strictEqual(imports[0].lineNo, 0);
      assert.strictEqual(imports[1].lineNo, 2);
    });

    test('should ignore inline comments after import', () => {
      const content = 'from mymodule import dostuff  # this is a comment';
      const imports = parsePythonImports(content);

      assert.strictEqual(imports.length, 1);
      assert.strictEqual(imports[0].modulePath, 'mymodule');
      assert.deepStrictEqual(imports[0].importedNames, ['dostuff']);
    });

    test('should handle import with extra whitespace', () => {
      const content = 'from   mymodule   import   dostuff ,  otherthing';
      const imports = parsePythonImports(content);

      assert.strictEqual(imports.length, 1);
      assert.strictEqual(imports[0].modulePath, 'mymodule');
      assert.deepStrictEqual(imports[0].importedNames, ['dostuff', 'otherthing']);
    });

    test('should handle indented imports', () => {
      const content = `if condition:
    from mymodule import dostuff`;
      const imports = parsePythonImports(content);

      assert.strictEqual(imports.length, 1);
      assert.strictEqual(imports[0].modulePath, 'mymodule');
      assert.deepStrictEqual(imports[0].importedNames, ['dostuff']);
    });

  });

});
