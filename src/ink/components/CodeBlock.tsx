/**
 * CodeBlock component with syntax highlighting.
 */

import React from 'react';
import { Box, Text } from 'ink';

export interface CodeBlockProps {
  code: string;
  language?: string;
  showLineNumbers?: boolean;
}

interface TokenStyle {
  color: string;
  bold?: boolean;
}

// Simple syntax highlighting for common languages
const KEYWORDS: Record<string, string[]> = {
  javascript: ['const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'class', 'import', 'export', 'from', 'async', 'await', 'try', 'catch', 'throw', 'new', 'this', 'true', 'false', 'null', 'undefined'],
  typescript: ['const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'class', 'import', 'export', 'from', 'async', 'await', 'try', 'catch', 'throw', 'new', 'this', 'true', 'false', 'null', 'undefined', 'interface', 'type', 'enum', 'extends', 'implements', 'private', 'public', 'protected'],
  python: ['def', 'class', 'if', 'elif', 'else', 'for', 'while', 'return', 'import', 'from', 'as', 'try', 'except', 'finally', 'with', 'True', 'False', 'None', 'and', 'or', 'not', 'in', 'is', 'lambda', 'yield', 'async', 'await'],
  go: ['func', 'return', 'if', 'else', 'for', 'range', 'switch', 'case', 'default', 'import', 'package', 'type', 'struct', 'interface', 'map', 'chan', 'go', 'defer', 'true', 'false', 'nil', 'const', 'var'],
  rust: ['fn', 'let', 'mut', 'if', 'else', 'match', 'for', 'while', 'loop', 'return', 'use', 'mod', 'pub', 'struct', 'enum', 'impl', 'trait', 'true', 'false', 'self', 'Self', 'crate', 'async', 'await', 'move'],
  sql: ['SELECT', 'FROM', 'WHERE', 'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE', 'CREATE', 'TABLE', 'DROP', 'ALTER', 'INDEX', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER', 'ON', 'AND', 'OR', 'NOT', 'NULL', 'PRIMARY', 'KEY', 'FOREIGN', 'REFERENCES'],
};

const COLORS = {
  keyword: 'cyan',
  string: 'green',
  number: 'magenta',
  comment: 'gray',
  function: 'blue',
  operator: 'yellow',
  punctuation: 'white',
};

function tokenize(code: string, language: string = 'javascript'): Array<{ text: string; style?: TokenStyle }> {
  const tokens: Array<{ text: string; style?: TokenStyle }> = [];
  const keywords = KEYWORDS[language] || [];

  // Simple tokenizer
  let current = 0;
  while (current < code.length) {
    // Comments
    if (code.slice(current, current + 2) === '//' || (language !== 'python' && code.slice(current, current + 2) === '/*')) {
      const endComment = code.indexOf('\n', current);
      const comment = endComment === -1 ? code.slice(current) : code.slice(current, endComment);
      tokens.push({ text: comment, style: { color: COLORS.comment } });
      current += comment.length;
      continue;
    }

    // Python comment
    if (language === 'python' && code[current] === '#') {
      const endComment = code.indexOf('\n', current);
      const comment = endComment === -1 ? code.slice(current) : code.slice(current, endComment);
      tokens.push({ text: comment, style: { color: COLORS.comment } });
      current += comment.length;
      continue;
    }

    // Strings (double and single quoted)
    if (code[current] === '"' || code[current] === "'") {
      const quote = code[current];
      let end = current + 1;
      while (end < code.length && (code[end] !== quote || code[end - 1] === '\\')) {
        end++;
      }
      const str = code.slice(current, end + 1);
      tokens.push({ text: str, style: { color: COLORS.string } });
      current = end + 1;
      continue;
    }

    // Numbers
    if (/[0-9]/.test(code[current])) {
      let end = current;
      while (end < code.length && /[0-9.xXa-fA-F]/.test(code[end])) {
        end++;
      }
      tokens.push({ text: code.slice(current, end), style: { color: COLORS.number } });
      current = end;
      continue;
    }

    // Words (identifiers and keywords)
    if (/[a-zA-Z_$]/.test(code[current])) {
      let end = current;
      while (end < code.length && /[a-zA-Z0-9_$-]/.test(code[end])) {
        end++;
      }
      const word = code.slice(current, end);
      const isKeyword = keywords.includes(word);
      tokens.push({
        text: word,
        style: isKeyword
          ? { color: COLORS.keyword }
          : { color: 'white' },
      });
      current = end;
      continue;
    }

    // Operators and punctuation
    const op = code[current];
    tokens.push({ text: op, style: { color: /[+\-*/=<>!&|]/.test(op) ? COLORS.operator : COLORS.punctuation } });
    current++;
  }

  return tokens;
}

export function CodeBlock({ code, language = 'javascript', showLineNumbers = false }: CodeBlockProps): React.ReactElement {
  const lines = code.split('\n');
  const tokens = tokenize(code, language);

  // Group tokens back into lines
  const tokenizedLines: Array<Array<{ text: string; style?: TokenStyle }>> = [];
  let currentLine: Array<{ text: string; style?: TokenStyle }> = [];
  for (const token of tokens) {
    if (token.text.includes('\n')) {
      const parts = token.text.split('\n');
      for (let i = 0; i < parts.length; i++) {
        if (parts[i]) currentLine.push({ text: parts[i], style: token.style });
        if (i < parts.length - 1) {
          tokenizedLines.push(currentLine);
          currentLine = [];
        }
      }
    } else {
      currentLine.push(token);
    }
  }
  if (currentLine.length > 0) {
    tokenizedLines.push(currentLine);
  }

  return (
    <Box flexDirection="column">
      {showLineNumbers
        ? tokenizedLines.map((line, i) => (
            <Box key={i}>
              <Text dimColor>{String(i + 1).padStart(3, ' ')} │ </Text>
              {line.map((token, j) => (
                <Text key={j} color={token.style?.color} bold={token.style?.bold}>
                  {token.text}
                </Text>
              ))}
            </Box>
          ))
        : lines.map((line, i) => (
            <Text key={i}>{line || ' '}</Text>
          ))}
    </Box>
  );
}

export default CodeBlock;