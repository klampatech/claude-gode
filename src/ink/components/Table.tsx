/**
 * Table component for tabular data display.
 */

import React from 'react';
import { Box, Text } from 'ink';

export interface TableColumn {
  header: string;
  width?: number;
  align?: 'left' | 'center' | 'right';
}

export interface TableProps {
  columns: TableColumn[];
  rows: string[][];
  maxHeight?: number;
}

export function Table({ columns, rows, maxHeight }: TableProps): React.ReactElement {
  const calculateWidth = (col: TableColumn, index: number): number => {
    if (col.width) return col.width;

    // Calculate max content width
    let maxWidth = col.header.length;
    for (const row of rows) {
      if (row[index]) {
        maxWidth = Math.max(maxWidth, row[index].length);
      }
    }
    return maxWidth + 2; // Padding
  };

  const widths = columns.map((col, i) => calculateWidth(col, i));

  const renderCell = (content: string, width: number, align: 'left' | 'center' | 'right' = 'left') => {
    const padded = content.padEnd(width - 1, ' ');
    if (align === 'right') {
      return padded.padStart(width, ' ');
    } else if (align === 'center') {
      const leftPad = Math.floor((width - content.length) / 2);
      const rightPad = width - content.length - leftPad;
      return ' '.repeat(leftPad) + content + ' '.repeat(rightPad);
    }
    return padded;
  };

  // Header
  const headerCells = columns.map((col, i) => (
    <Text key={i} bold>
      {renderCell(col.header, widths[i], col.align)}
    </Text>
  ));

  // Separator
  const separator = widths.map((w) => '─'.repeat(w)).join('┼');

  // Rows
  const visibleRows = maxHeight ? rows.slice(0, maxHeight - 2) : rows;

  return (
    <Box flexDirection="column">
      {/* Header */}
      <Box>{headerCells}</Box>
      <Text>{separator}</Text>
      {/* Body */}
      {visibleRows.map((row, rowIndex) => (
        <Box key={rowIndex}>
          {row.map((cell, cellIndex) => (
            <Text key={cellIndex}>{renderCell(cell, widths[cellIndex], columns[cellIndex].align)}</Text>
          ))}
        </Box>
      ))}
      {maxHeight && rows.length > maxHeight - 2 && (
        <Box>
          <Text dimColor>... {rows.length - maxHeight + 2} more rows</Text>
        </Box>
      )}
    </Box>
  );
}

export default Table;