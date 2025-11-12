```typescript
'use client';

import { Button, buttonVariants } from '@/components/ui/button';
import { Copy, Check } from 'lucide-react';
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard';
import { cn } from '@/lib/utils';
import { type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';

type ButtonProps = ComponentProps<"button"> & VariantProps<typeof buttonVariants> & {
  asChild?: boolean;
};

interface CopyButtonProps extends Omit<ButtonProps, 'onClick'> {
  /** The text content to copy to clipboard */
  textToCopy: string;
  /** Custom success message for the toast */
  successMessage?: string;
  /** Custom error message for the toast */
  errorMessage?: string;
  /** Size of the copy/check icons */
  iconSize?: number;
  /** Custom callback when copy is successful */
  onCopySuccess?: () => void;
  /** Custom callback when copy fails */
  onCopyError?: (error: unknown) => void;
}

export function CopyButton({
  textToCopy,
  successMessage,
  errorMessage,
  iconSize = 16,
  onCopySuccess,
  onCopyError,
  className,
  variant = 'ghost',
  size = 'icon',
  ...props
}: CopyButtonProps) {
  const { isCopied, copyToClipboard } = useCopyToClipboard({
    successMessage,
    errorMessage,
  });

  const handleCopy = async () => {
    try {
      await copyToClipboard(textToCopy, successMessage);
      onCopySuccess?.();
    } catch (error) {
      onCopyError?.(error);
    }
  };

  return (
    <Button
      variant={variant}
      size={size}
      className={cn(
        'h-fit w-fit p-2 m-0 text-muted-foreground hover:text-primary',
        className
      )}
      onClick={handleCopy}
      disabled={!textToCopy}
      {...props}
    >
      {isCopied ? (
        <Check className="" size={iconSize} />
      ) : (
        <Copy className="" size={iconSize} />
      )}
    </Button>
  );
}

```

