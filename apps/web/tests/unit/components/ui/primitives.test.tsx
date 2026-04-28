/**
 * Primitive smoke tests — Badge, Button, Card, Input, Separator, Skeleton, Tabs.
 *
 * These primitives are presentational. The tests exercise the public
 * variant API + class application surface so a future refactor that
 * mistakenly drops the `primary` Button styling, or breaks the Tabs
 * arrow-key handling, fails CI rather than slipping through to a UX
 * audit. Coverage-wise: ratchets the function-coverage threshold up
 * by exercising the variant + render branches the data-browser e2e
 * suite already covers.
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import {
  Card,
  CardBody,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Separator } from '@/components/ui/Separator';
import { Skeleton, TableSkeleton, CardSkeleton } from '@/components/ui/Skeleton';
import { Tabs } from '@/components/ui/Tabs';

describe('Badge', () => {
  it('renders children as a span with default variant classes', () => {
    render(<Badge>v1.2</Badge>);
    const node = screen.getByText('v1.2');
    expect(node.tagName).toBe('SPAN');
  });

  it('applies the teal variant class for variant="teal"', () => {
    render(<Badge variant="teal">FAIR</Badge>);
    expect(screen.getByText('FAIR').className).toMatch(/text-ndi-teal/);
  });

  it('applies the pub variant class for variant="pub"', () => {
    render(<Badge variant="pub">Published</Badge>);
    expect(screen.getByText('Published').className).toMatch(/EAF4FF/);
  });
});

describe('Button', () => {
  it('renders children, defaults to primary + md', () => {
    render(<Button>Click</Button>);
    const btn = screen.getByRole('button', { name: 'Click' });
    expect(btn.className).toMatch(/bg-ndi-teal/);
  });

  it('applies the secondary variant class when variant="secondary"', () => {
    render(<Button variant="secondary">Cancel</Button>);
    expect(screen.getByRole('button', { name: 'Cancel' }).className).toMatch(
      /ring-border-strong/,
    );
  });

  it('applies the danger variant class when variant="danger"', () => {
    render(<Button variant="danger">Delete</Button>);
    expect(screen.getByRole('button', { name: 'Delete' }).className).toMatch(
      /bg-red-600/,
    );
  });

  it('forwards onClick to the underlying button', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Go</Button>);
    fireEvent.click(screen.getByRole('button', { name: 'Go' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe('Card', () => {
  it('renders Header, Title, Description, and Body children', () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Hello</CardTitle>
          <CardDescription>Subtitle</CardDescription>
        </CardHeader>
        <CardBody>body</CardBody>
      </Card>,
    );
    expect(screen.getByRole('heading', { name: 'Hello' })).toBeInTheDocument();
    expect(screen.getByText('Subtitle')).toBeInTheDocument();
    expect(screen.getByText('body')).toBeInTheDocument();
  });

  it('renders CardTitle as the requested heading level', () => {
    render(<CardTitle as="h3">Title3</CardTitle>);
    const heading = screen.getByRole('heading', { name: 'Title3' });
    expect(heading.tagName).toBe('H3');
  });
});

describe('Input', () => {
  it('forwards placeholder and value', () => {
    render(<Input placeholder="email" defaultValue="a@b.com" />);
    const input = screen.getByPlaceholderText('email') as HTMLInputElement;
    expect(input.value).toBe('a@b.com');
  });
});

describe('Separator', () => {
  it('renders a horizontal hr by default', () => {
    const { container } = render(<Separator data-testid="sep" />);
    expect(container.querySelector('hr')).not.toBeNull();
  });

  it('renders a vertical span when orientation="vertical"', () => {
    render(<Separator orientation="vertical" />);
    const sep = screen.getByRole('separator');
    expect(sep.getAttribute('aria-orientation')).toBe('vertical');
  });
});

describe('Skeleton family', () => {
  it('Skeleton renders an aria-hidden div with .skeleton', () => {
    const { container } = render(<Skeleton />);
    expect(container.querySelector('div.skeleton')).not.toBeNull();
  });

  it('TableSkeleton renders the requested number of rows + a header', () => {
    render(<TableSkeleton rows={4} />);
    // 1 header skeleton + 4 row skeletons.
    expect(document.querySelectorAll('.skeleton').length).toBe(5);
  });

  it('CardSkeleton renders three skeleton lines', () => {
    render(<CardSkeleton />);
    expect(document.querySelectorAll('.skeleton').length).toBe(3);
  });
});

describe('Tabs', () => {
  // Generic <Tabs> primitive smoke — `documents` is a stand-in third
  // tab to exercise arrow-key wrap-around. Not specific to the dataset
  // tab bar (that's covered in dataset-tabs.test.tsx).
  const TABS = [
    { id: 'overview', label: 'Overview' },
    { id: 'tables', label: 'Tables' },
    { id: 'documents', label: 'Documents' },
  ] as const;

  it('renders all tabs and marks the active one with aria-selected', () => {
    render(<Tabs tabs={[...TABS]} active="overview" onSelect={() => {}} />);
    const overview = screen.getByRole('tab', { name: 'Overview' });
    const tables = screen.getByRole('tab', { name: 'Tables' });
    expect(overview.getAttribute('aria-selected')).toBe('true');
    expect(tables.getAttribute('aria-selected')).toBe('false');
  });

  it('calls onSelect with the clicked tab id', () => {
    const onSelect = vi.fn();
    render(<Tabs tabs={[...TABS]} active="overview" onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Tables' }));
    expect(onSelect).toHaveBeenCalledWith('tables');
  });

  it('ArrowRight selects the next tab', () => {
    const onSelect = vi.fn();
    render(<Tabs tabs={[...TABS]} active="overview" onSelect={onSelect} />);
    const overview = screen.getByRole('tab', { name: 'Overview' });
    fireEvent.keyDown(overview, { key: 'ArrowRight' });
    expect(onSelect).toHaveBeenCalledWith('tables');
  });

  it('ArrowLeft wraps from first to last', () => {
    const onSelect = vi.fn();
    render(<Tabs tabs={[...TABS]} active="overview" onSelect={onSelect} />);
    const overview = screen.getByRole('tab', { name: 'Overview' });
    fireEvent.keyDown(overview, { key: 'ArrowLeft' });
    expect(onSelect).toHaveBeenCalledWith('documents');
  });
});
