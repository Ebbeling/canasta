import { Component, type ErrorInfo, type ReactNode } from 'react';
import type { FieldType } from '@/rules/schema/field';
import {
  BooleanField,
  ChoiceField,
  CountField,
  MultiSelectField,
  PointsField,
  UnsupportedField,
  type FieldControlProps,
  type FieldRenderer,
} from './controls';

const RENDERERS: Record<FieldType, FieldRenderer> = {
  points: PointsField,
  count: CountField,
  boolean: BooleanField,
  choice: ChoiceField,
  multiselect: MultiSelectField,
};

/** Keeps one broken control from blanking the whole round form. */
class FieldErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Veld kon niet worden getoond', error, info);
  }

  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/**
 * Renders one field by its declared type.
 *
 * The lookup goes through a `string` index on purpose. TypeScript says the union
 * is closed, but a rule set reaching this component may have come out of
 * IndexedDB, written by an older or newer build — at runtime `field.type` is
 * just a string.
 */
export function FieldControl(props: FieldControlProps) {
  const lookup = RENDERERS as Record<string, FieldRenderer | undefined>;
  const Renderer = lookup[props.field.type];
  const fallback = <UnsupportedField {...props} />;

  if (!Renderer) return fallback;

  return (
    <FieldErrorBoundary fallback={fallback}>
      <Renderer {...props} />
    </FieldErrorBoundary>
  );
}
