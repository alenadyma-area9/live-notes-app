import { Box, Text, HStack, VStack } from "@chakra-ui/react";
import * as Y from "yjs";
import type { ReactNode } from "react";

interface Block {
  type: "paragraph" | "heading1" | "heading2" | "bulletList" | "orderedList";
  content: FormattedSegment[];
}

interface FormattedSegment {
  text: string;
  bold?: boolean;
  italic?: boolean;
  strike?: boolean;
}

interface DiffSegment {
  type: "added" | "removed" | "unchanged" | "style-changed";
  segment: FormattedSegment;
  oldStyle?: FormattedSegment; // For style changes, keep old style info
}

interface InlineDiffViewProps {
  oldDoc?: Y.Doc;
  newDoc?: Y.Doc;
  oldText: string;
  newText: string;
  oldVersion: { editedBy: string; editorColor: string; timestamp: number };
  newVersion: { editedBy: string; editorColor: string; timestamp: number };
}

// Extract blocks with formatting from Y.Doc
export function extractBlocksFromDoc(doc: Y.Doc): Block[] {
  const blocks: Block[] = [];

  try {
    const fragment = doc.getXmlFragment("default");
    extractBlocksFromXml(fragment, blocks);
  } catch {
    return [];
  }

  return blocks;
}

function extractBlocksFromXml(
  element: Y.XmlFragment | Y.XmlElement,
  blocks: Block[],
  listType?: "bulletList" | "orderedList"
): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const children = (element as any).toArray?.() || [];

  for (const child of children) {
    if (child instanceof Y.XmlElement) {
      const tagName = child.nodeName;

      if (tagName === "paragraph") {
        const content = getFormattedContent(child);
        blocks.push({ type: "paragraph", content });
      } else if (tagName === "heading") {
        const level = child.getAttribute("level");
        const content = getFormattedContent(child);
        blocks.push({
          type: level === 1 ? "heading1" : "heading2",
          content
        });
      } else if (tagName === "bulletList") {
        extractBlocksFromXml(child, blocks, "bulletList");
      } else if (tagName === "orderedList") {
        extractBlocksFromXml(child, blocks, "orderedList");
      } else if (tagName === "listItem") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const listChildren = (child as any).toArray?.() || [];
        for (const listChild of listChildren) {
          if (listChild instanceof Y.XmlElement && listChild.nodeName === "paragraph") {
            const content = getFormattedContent(listChild);
            blocks.push({
              type: listType === "orderedList" ? "orderedList" : "bulletList",
              content
            });
          }
        }
      } else {
        extractBlocksFromXml(child, blocks, listType);
      }
    }
  }
}

function getFormattedContent(element: Y.XmlElement): FormattedSegment[] {
  const segments: FormattedSegment[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const children = (element as any).toArray?.() || [];

  for (const child of children) {
    if (child instanceof Y.XmlText) {
      const delta = child.toDelta();

      for (const op of delta) {
        if (typeof op.insert === "string") {
          const attrs = op.attributes || {};
          segments.push({
            text: op.insert,
            bold: !!attrs.bold,
            italic: !!attrs.italic,
            strike: !!attrs.strike,
          });
        }
      }
    } else if (child instanceof Y.XmlElement) {
      const nestedSegments = getFormattedContent(child);
      segments.push(...nestedSegments);
    }
  }

  if (segments.length === 0) {
    segments.push({ text: "" });
  }

  return segments;
}

// Get plain text from formatted segments
function getPlainText(segments: FormattedSegment[]): string {
  return segments.map(s => s.text).join("");
}

// Check if two segments have different styles
function hasStyleDiff(a: FormattedSegment, b: FormattedSegment): boolean {
  return a.bold !== b.bold || a.italic !== b.italic || a.strike !== b.strike;
}

// Compare blocks
interface DiffBlock {
  type: Block["type"];
  status: "unchanged" | "modified" | "added" | "removed" | "style-only";
  segments: DiffSegment[];
}

function computeSegmentDiff(oldSegments: FormattedSegment[], newSegments: FormattedSegment[]): { segments: DiffSegment[]; isStyleOnly: boolean } {
  const oldText = getPlainText(oldSegments);
  const newText = getPlainText(newSegments);

  // Same text - check for style changes only
  if (oldText === newText) {
    // Compare character by character for style changes
    const result: DiffSegment[] = [];
    let hasAnyStyleChange = false;

    // Flatten to character-level comparison
    let oldPos = 0;
    let newPos = 0;
    let oldSegIdx = 0;
    let newSegIdx = 0;
    let oldCharInSeg = 0;
    let newCharInSeg = 0;

    while (newPos < newText.length) {
      const oldSeg = oldSegments[oldSegIdx];
      const newSeg = newSegments[newSegIdx];

      if (!oldSeg || !newSeg) break;

      const char = newText[newPos];
      const styleChanged = hasStyleDiff(oldSeg, newSeg);

      if (styleChanged) hasAnyStyleChange = true;

      // Find or create segment for this character
      const lastResult = result[result.length - 1];
      if (lastResult &&
          lastResult.type === (styleChanged ? "style-changed" : "unchanged") &&
          lastResult.segment.bold === newSeg.bold &&
          lastResult.segment.italic === newSeg.italic &&
          lastResult.segment.strike === newSeg.strike) {
        lastResult.segment.text += char;
      } else {
        result.push({
          type: styleChanged ? "style-changed" : "unchanged",
          segment: { text: char, bold: newSeg.bold, italic: newSeg.italic, strike: newSeg.strike },
          oldStyle: styleChanged ? { text: char, bold: oldSeg.bold, italic: oldSeg.italic, strike: oldSeg.strike } : undefined,
        });
      }

      oldPos++;
      newPos++;
      oldCharInSeg++;
      newCharInSeg++;

      if (oldCharInSeg >= oldSeg.text.length) {
        oldSegIdx++;
        oldCharInSeg = 0;
      }
      if (newCharInSeg >= newSeg.text.length) {
        newSegIdx++;
        newCharInSeg = 0;
      }
    }

    return { segments: result, isStyleOnly: hasAnyStyleChange };
  }

  // Different text - do word-level diff
  const oldWords = oldText.split(/(\s+)/);
  const newWords = newText.split(/(\s+)/);

  const lcs = computeLCS(oldWords, newWords);
  const diff: { type: "added" | "removed" | "unchanged"; text: string }[] = [];

  let oldIdx = 0;
  let newIdx = 0;
  let lcsIdx = 0;

  while (oldIdx < oldWords.length || newIdx < newWords.length) {
    if (lcsIdx < lcs.length && oldIdx < oldWords.length && oldWords[oldIdx] === lcs[lcsIdx]) {
      if (newIdx < newWords.length && newWords[newIdx] === lcs[lcsIdx]) {
        diff.push({ type: "unchanged", text: oldWords[oldIdx] });
        oldIdx++;
        newIdx++;
        lcsIdx++;
      } else {
        diff.push({ type: "added", text: newWords[newIdx] });
        newIdx++;
      }
    } else if (lcsIdx < lcs.length && newIdx < newWords.length && newWords[newIdx] === lcs[lcsIdx]) {
      diff.push({ type: "removed", text: oldWords[oldIdx] });
      oldIdx++;
    } else if (oldIdx < oldWords.length && (lcsIdx >= lcs.length || oldWords[oldIdx] !== lcs[lcsIdx])) {
      diff.push({ type: "removed", text: oldWords[oldIdx] });
      oldIdx++;
    } else if (newIdx < newWords.length) {
      diff.push({ type: "added", text: newWords[newIdx] });
      newIdx++;
    } else {
      break;
    }
  }

  // Map diff words back to formatted segments
  const result: DiffSegment[] = [];
  let oldTextPos = 0;
  let newTextPos = 0;

  for (const d of diff) {
    let formatting: FormattedSegment = { text: d.text };
    const sourceSegments = d.type === "removed" ? oldSegments : newSegments;
    const sourcePos = d.type === "removed" ? oldTextPos : newTextPos;

    // Find which segment contains this position
    let pos = 0;
    for (const seg of sourceSegments) {
      if (pos + seg.text.length > sourcePos) {
        formatting = { ...seg, text: d.text };
        break;
      }
      pos += seg.text.length;
    }

    result.push({ type: d.type, segment: formatting });

    if (d.type === "removed") {
      oldTextPos += d.text.length;
    } else {
      newTextPos += d.text.length;
      if (d.type === "unchanged") {
        oldTextPos += d.text.length;
      }
    }
  }

  return { segments: result, isStyleOnly: false };
}

function computeLCS(arr1: string[], arr2: string[]): string[] {
  const m = arr1.length;
  const n = arr2.length;
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (arr1[i - 1] === arr2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const lcs: string[] = [];
  let i = m, j = n;
  while (i > 0 && j > 0) {
    if (arr1[i - 1] === arr2[j - 1]) {
      lcs.unshift(arr1[i - 1]);
      i--;
      j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }

  return lcs;
}

// Calculate similarity between two strings (0-1)
function textSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;

  const aWords = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  const bWords = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 2));

  if (aWords.size === 0 || bWords.size === 0) return 0;

  let intersection = 0;
  for (const word of aWords) {
    if (bWords.has(word)) intersection++;
  }

  return intersection / Math.max(aWords.size, bWords.size);
}

function compareBlocks(oldBlocks: Block[], newBlocks: Block[]): DiffBlock[] {
  const result: DiffBlock[] = [];

  // First, find best matches between old and new blocks using LCS on text content
  const oldTexts = oldBlocks.map(b => getPlainText(b.content));
  const newTexts = newBlocks.map(b => getPlainText(b.content));

  // Build matching pairs using similarity
  const matches: { oldIdx: number; newIdx: number; similarity: number }[] = [];
  const usedOld = new Set<number>();
  const usedNew = new Set<number>();

  // First pass: exact matches
  for (let o = 0; o < oldTexts.length; o++) {
    for (let n = 0; n < newTexts.length; n++) {
      if (oldTexts[o] === newTexts[n] && !usedOld.has(o) && !usedNew.has(n)) {
        matches.push({ oldIdx: o, newIdx: n, similarity: 1 });
        usedOld.add(o);
        usedNew.add(n);
        break;
      }
    }
  }

  // Second pass: similar matches (>50% similarity)
  for (let o = 0; o < oldTexts.length; o++) {
    if (usedOld.has(o)) continue;

    let bestMatch = -1;
    let bestSimilarity = 0.5; // Minimum threshold

    for (let n = 0; n < newTexts.length; n++) {
      if (usedNew.has(n)) continue;

      const sim = textSimilarity(oldTexts[o], newTexts[n]);
      if (sim > bestSimilarity) {
        bestSimilarity = sim;
        bestMatch = n;
      }
    }

    if (bestMatch >= 0) {
      matches.push({ oldIdx: o, newIdx: bestMatch, similarity: bestSimilarity });
      usedOld.add(o);
      usedNew.add(bestMatch);
    }
  }

  // Sort matches by newIdx to maintain order
  matches.sort((a, b) => a.newIdx - b.newIdx);

  // Build result by walking through new blocks in order
  const processedOld = new Set<number>();

  for (let n = 0; n < newBlocks.length; n++) {
    const newBlock = newBlocks[n];
    const newText = newTexts[n];

    // Check if this new block has a match
    const match = matches.find(m => m.newIdx === n);

    if (match) {
      // Output any unmatched old blocks before this match as "removed"
      for (let o = 0; o < oldBlocks.length; o++) {
        if (!processedOld.has(o) && !usedOld.has(o)) {
          // Check if this old block should come before the matched one
          if (o < match.oldIdx) {
            result.push({
              type: oldBlocks[o].type,
              status: "removed",
              segments: oldBlocks[o].content.map(s => ({ type: "removed" as const, segment: s })),
            });
            processedOld.add(o);
          }
        }
      }

      const oldBlock = oldBlocks[match.oldIdx];
      const oldText = oldTexts[match.oldIdx];
      processedOld.add(match.oldIdx);

      const sameText = oldText === newText;
      const sameType = oldBlock.type === newBlock.type;

      if (sameText && sameType) {
        // Check for inline style changes
        const { segments, isStyleOnly } = computeSegmentDiff(oldBlock.content, newBlock.content);
        const hasStyleChanges = segments.some(s => s.type === "style-changed");

        result.push({
          type: newBlock.type,
          status: hasStyleChanges || isStyleOnly ? "style-only" : "unchanged",
          segments,
        });
      } else if (sameText && !sameType) {
        // Block type changed (paragraph → heading)
        result.push({
          type: newBlock.type,
          status: "style-only",
          segments: newBlock.content.map(s => ({ type: "style-changed" as const, segment: s })),
        });
      } else {
        // Text changed
        const { segments } = computeSegmentDiff(oldBlock.content, newBlock.content);
        result.push({
          type: newBlock.type,
          status: "modified",
          segments,
        });
      }
    } else {
      // New block with no match - it was added
      result.push({
        type: newBlock.type,
        status: "added",
        segments: newBlock.content.map(s => ({ type: "added" as const, segment: s })),
      });
    }
  }

  // Add any remaining unprocessed old blocks as "removed"
  for (let o = 0; o < oldBlocks.length; o++) {
    if (!processedOld.has(o)) {
      result.push({
        type: oldBlocks[o].type,
        status: "removed",
        segments: oldBlocks[o].content.map(s => ({ type: "removed" as const, segment: s })),
      });
    }
  }

  return result;
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Render formatted text with diff highlighting
function FormattedText({ segment, diffType }: { segment: FormattedSegment; diffType: DiffSegment["type"] }): ReactNode {
  const baseStyle: React.CSSProperties = {};

  if (segment.bold) baseStyle.fontWeight = "bold";
  if (segment.italic) baseStyle.fontStyle = "italic";
  if (segment.strike && diffType !== "removed") baseStyle.textDecoration = "line-through";

  if (diffType === "added") {
    return (
      <Text
        as="span"
        style={baseStyle}
        bg="green.100"
        color="green.800"
        borderRadius="sm"
      >
        {segment.text}
      </Text>
    );
  } else if (diffType === "removed") {
    return (
      <Text
        as="span"
        style={{ ...baseStyle, textDecoration: "line-through" }}
        bg="red.100"
        color="red.500"
        borderRadius="sm"
      >
        {segment.text}
      </Text>
    );
  } else if (diffType === "style-changed") {
    return (
      <Text
        as="span"
        style={baseStyle}
        bg="orange.100"
        color="orange.800"
        borderRadius="sm"
      >
        {segment.text}
      </Text>
    );
  } else {
    return <Text as="span" style={baseStyle}>{segment.text}</Text>;
  }
}

// Render a block with proper styling
function DiffBlockView({ block, listIndex }: { block: DiffBlock; listIndex?: number }) {
  const isEmpty = block.segments.every(s => !s.segment.text.trim());
  if (block.status === "unchanged" && isEmpty) {
    return <Box h={4} />;
  }

  const content = (
    <>
      {block.segments.map((seg, idx) => (
        <FormattedText key={idx} segment={seg.segment} diffType={seg.type} />
      ))}
    </>
  );

  const getBorderColor = () => {
    switch (block.status) {
      case "added": return "green.400";
      case "removed": return "red.400";
      case "modified": return "blue.400";
      case "style-only": return "orange.400";
      default: return "transparent";
    }
  };

  const borderProps = block.status !== "unchanged" ? {
    borderLeft: "3px solid",
    borderLeftColor: getBorderColor(),
    pl: 3,
  } : {};

  switch (block.type) {
    case "heading1":
      return (
        <Box py={2} fontSize="1.875rem" fontWeight="bold" {...borderProps}>
          {content}
        </Box>
      );
    case "heading2":
      return (
        <Box py={2} fontSize="1.5rem" fontWeight="bold" {...borderProps}>
          {content}
        </Box>
      );
    case "bulletList":
      return (
        <HStack py={1} align="start" pl={4} {...borderProps}>
          <Text mr={2}>•</Text>
          <Box flex={1}>{content}</Box>
        </HStack>
      );
    case "orderedList":
      return (
        <HStack py={1} align="start" pl={4} {...borderProps}>
          <Text mr={2}>{(listIndex ?? 0) + 1}.</Text>
          <Box flex={1}>{content}</Box>
        </HStack>
      );
    default:
      return (
        <Box py={1} {...borderProps}>
          {content || <Text color="gray.300">&nbsp;</Text>}
        </Box>
      );
  }
}

export function InlineDiffView({ oldDoc, newDoc, oldVersion, newVersion }: InlineDiffViewProps) {
  const oldBlocks = oldDoc ? extractBlocksFromDoc(oldDoc) : [];
  const newBlocks = newDoc ? extractBlocksFromDoc(newDoc) : [];

  const diffBlocks = compareBlocks(oldBlocks, newBlocks);

  const additions = diffBlocks.filter(b => b.status === "added").length;
  const removals = diffBlocks.filter(b => b.status === "removed").length;
  const modifications = diffBlocks.filter(b => b.status === "modified").length;
  const styleChanges = diffBlocks.filter(b => b.status === "style-only").length;

  let bulletIndex = 0;
  let orderedIndex = 0;

  return (
    <VStack align="stretch" gap={0}>
      {/* Info bar */}
      <HStack px={4} py={2} bg="gray.50" justify="space-between" flexWrap="wrap" gap={2}>
        <HStack gap={4} fontSize="sm">
          <HStack>
            <Box w={3} h={3} borderRadius="full" bg={oldVersion.editorColor} />
            <Text color="gray.600">
              <strong>{oldVersion.editedBy}</strong> ({formatTime(oldVersion.timestamp)})
            </Text>
          </HStack>
          <Text color="gray.400">→</Text>
          <HStack>
            <Box w={3} h={3} borderRadius="full" bg={newVersion.editorColor} />
            <Text color="gray.600">
              <strong>{newVersion.editedBy}</strong> ({formatTime(newVersion.timestamp)})
            </Text>
          </HStack>
        </HStack>
        <HStack gap={3} fontSize="sm">
          {additions > 0 && <Text color="green.600" fontWeight="medium">+{additions}</Text>}
          {removals > 0 && <Text color="red.600" fontWeight="medium">-{removals}</Text>}
          {modifications > 0 && <Text color="blue.600" fontWeight="medium">{modifications} text</Text>}
          {styleChanges > 0 && <Text color="orange.600" fontWeight="medium">{styleChanges} style</Text>}
        </HStack>
      </HStack>

      {/* Document */}
      <Box p={4} minH="400px" fontSize="md" lineHeight="1.8">
        {diffBlocks.length === 0 ? (
          <Text color="gray.500" textAlign="center" py={8}>No content</Text>
        ) : (
          <VStack align="stretch" gap={0}>
            {diffBlocks.map((block, idx) => {
              const prevBlock = idx > 0 ? diffBlocks[idx - 1] : null;

              if (block.type === "bulletList") {
                if (prevBlock?.type !== "bulletList") bulletIndex = 0;
                return <DiffBlockView key={idx} block={block} listIndex={bulletIndex++} />;
              }
              if (block.type === "orderedList") {
                if (prevBlock?.type !== "orderedList") orderedIndex = 0;
                return <DiffBlockView key={idx} block={block} listIndex={orderedIndex++} />;
              }

              bulletIndex = 0;
              orderedIndex = 0;
              return <DiffBlockView key={idx} block={block} />;
            })}
          </VStack>
        )}
      </Box>

      {/* Legend */}
      <HStack px={4} py={2} bg="gray.50" gap={4} fontSize="xs" color="gray.600" borderTop="1px solid" borderColor="gray.200" flexWrap="wrap">
        <HStack>
          <Box bg="green.100" px={2} py={0.5} borderRadius="sm">
            <Text color="green.800">added</Text>
          </Box>
        </HStack>
        <HStack>
          <Box bg="red.100" px={2} py={0.5} borderRadius="sm">
            <Text color="red.500" textDecoration="line-through">removed</Text>
          </Box>
        </HStack>
        <HStack>
          <Box borderLeft="3px solid" borderLeftColor="blue.400" pl={2}>
            <Text>text changed</Text>
          </Box>
        </HStack>
        <HStack>
          <Box bg="orange.100" px={2} py={0.5} borderRadius="sm">
            <Text color="orange.800">style changed</Text>
          </Box>
        </HStack>
      </HStack>
    </VStack>
  );
}
