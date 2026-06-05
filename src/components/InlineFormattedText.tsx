import type { ReactNode } from 'react';

type InlineFormattedTextProps = {
  text: string;
};

function formatInlineText(text: string): ReactNode[] {
  return text
    .split(/(\*[^*]+\*)/g)
    .filter((part) => part.length > 0)
    .map((part, index) => {
      if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
        return <em key={`${index}-em`}>{part.slice(1, -1)}</em>;
      }
      return part;
    });
}

export function InlineFormattedText({ text }: InlineFormattedTextProps) {
  return <>{formatInlineText(text)}</>;
}
