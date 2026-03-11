import { getLines } from '../common';

export interface PythonImport {
  modulePath: string;
  importedNames: string[];
  isRelative: boolean;
  relativeDots: number;
  lineNo: number;
  isWildcard?: boolean;
}

/**
 * Parses Python import statements from source code
 * @param content Python source code
 * @returns Array of parsed import statements
 */
export function parsePythonImports(content: string): PythonImport[] {
  if (!content || !content.trim()) {
    return [];
  }

  const imports: PythonImport[] = [];
  const lines = getLines(content);
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmedLine = line.trim();
    const lineNo = i;

    // Skip empty lines and comment-only lines
    if (!trimmedLine || trimmedLine.startsWith('#')) {
      i++;
      continue;
    }

    // Check if this line contains an import statement
    if (trimmedLine.startsWith('import ') || trimmedLine.startsWith('from ')) {
      const importResult = parseImportStatement(lines, i);
      if (importResult) {
        const { statement, endLine } = importResult;
        const parsed = parseImportLine(statement, lineNo);
        if (parsed) {
          imports.push(parsed);
        }
        i = endLine + 1;
        continue;
      }
    }

    i++;
  }

  return imports;
}

interface ImportResult {
  statement: string;
  endLine: number;
}

/**
 * Extracts a complete import statement which may span multiple lines
 */
function parseImportStatement(lines: string[], startLine: number): ImportResult | null {
  const lines_array: string[] = [];
  let currentLine = startLine;

  while (currentLine < lines.length) {
    const line = lines[currentLine].trim();

    // Skip empty lines
    if (!line) {
      currentLine++;
      continue;
    }

    lines_array.push(line);

    // Check if line ends with backslash continuation
    if (line.endsWith('\\')) {
      // Remove the backslash and continue to next line
      lines_array[lines_array.length - 1] = line.slice(0, -1).trim();
      currentLine++;
      continue;
    }

    // Check if we have an open parenthesis - continue until closed
    const openParens = (lines_array.join('').match(/\(/g) || []).length;
    const closeParens = (lines_array.join('').match(/\)/g) || []).length;

    if (openParens > closeParens) {
      currentLine++;
      continue;
    }

    // Complete import statement found
    return {
      statement: lines_array.join(' '),
      endLine: currentLine
    };
  }

  if (lines_array.length > 0) {
    return {
      statement: lines_array.join(' '),
      endLine: currentLine - 1
    };
  }

  return null;
}

/**
 * Parses a single import statement into a PythonImport object
 */
function parseImportLine(statement: string, lineNo: number): PythonImport | null {
  const statement_trimmed = statement.trim();

  // Handle "import X" or "import X as Y"
  if (statement_trimmed.startsWith('import ')) {
    return parseImportStatement_Import(statement_trimmed, lineNo);
  }

  // Handle "from X import Y"
  if (statement_trimmed.startsWith('from ')) {
    return parseImportStatement_From(statement_trimmed, lineNo);
  }

  return null;
}

/**
 * Parses "import X" or "import X as Y" statements
 */
function parseImportStatement_Import(statement: string, lineNo: number): PythonImport | null {
  const match = statement.match(/^import\s+([a-zA-Z0-9_.]+)(?:\s+as\s+([a-zA-Z0-9_]+))?/i);
  if (!match) {
    return null;
  }

  const modulePath = match[1];
  const alias = match[2];

  // Ignore behave imports
  if (modulePath === 'behave') {
    return null;
  }

  const importedNames = alias ? [alias] : [modulePath];

  return {
    modulePath,
    importedNames,
    isRelative: false,
    relativeDots: 0,
    lineNo
  };
}

/**
 * Parses "from X import Y" statements
 */
function parseImportStatement_From(statement: string, lineNo: number): PythonImport | null {
  // Extract the module path (the part after "from" and before "import")
  const fromMatch = statement.match(/^from\s+([\\.a-zA-Z0-9_]+)\s+import\s+([\s\S]+)$/i);
  if (!fromMatch) {
    return null;
  }

  const modulePathRaw = fromMatch[1];
  let importPart = fromMatch[2];

  // Remove inline comments
  const commentIndex = importPart.indexOf('#');
  if (commentIndex !== -1) {
    importPart = importPart.substring(0, commentIndex);
  }
  importPart = importPart.trim();

  // Ignore behave imports
  if (modulePathRaw === 'behave') {
    return null;
  }

  // Calculate relative dots count
  let relativeDots = 0;
  const modulePath = modulePathRaw;

  const dotMatch = modulePathRaw.match(/^\.+/);
  if (dotMatch) {
    relativeDots = dotMatch[0].length;
  }

  const isRelative = relativeDots > 0 || modulePathRaw === '.';

  // Check for wildcard import first
  const wildcardMatch = importPart.trim().match(/^\*$/);
  if (wildcardMatch) {
    // Wildcard import - return without imported names but mark as wildcard
    return {
      modulePath,
      importedNames: ['*'],  // Mark it as wildcard
      isRelative,
      relativeDots,
      lineNo,
      isWildcard: true
    };
  }

  // Parse the imported names
  const importedNames = parseImportedNames(importPart);

  if (importedNames.length === 0) {
    return null;
  }

  return {
    modulePath,
    importedNames,
    isRelative,
    relativeDots,
    lineNo
  };
}

/**
 * Parses the list of imported names from the import part
 * Handles:
 *   - name
 *   - name1, name2
 *   - name as alias
 *   - name1 as alias1, name2 as alias2
 *   - (name1, name2)  [with or without trailing comma]
 */
function parseImportedNames(importPart: string): string[] {
  const names: string[] = [];

  // Remove leading/trailing whitespace
  let part = importPart.trim();

  // Remove parentheses if present
  if (part.startsWith('(') && part.endsWith(')')) {
    part = part.slice(1, -1).trim();
  }

  // Handle wildcard imports - skip them
  if (part.trim() === '*') {
    return [];
  }

  // Split by comma
  const items = part.split(',');

  for (const item of items) {
    const trimmed = item.trim();
    if (!trimmed) {
      continue;
    }

    // Check if this item has an alias (contains " as ")
    const asMatch = trimmed.match(/^(\w+)\s+as\s+(\w+)$/i);
    if (asMatch) {
      // Use the alias name
      names.push(asMatch[2]);
    } else {
      // Use the imported name directly
      names.push(trimmed);
    }
  }

  return names;
}
