/* eslint-disable no-new */
import { Offset, Range, InsertOptions } from '../public/mathfield';
import { Atom } from '../core/atom-class';
import { LatexAtom, LatexGroupAtom } from '../core-atoms/latex';
import { MathfieldPrivate } from './mathfield-private';
import { requestUpdate } from './render';
import { range } from '../editor-model/selection-utils';
import { Style } from '../public/core';
import { ModeEditor } from './mode-editor';

import { COMMAND_MODE_CHARACTERS } from '../core/core';
import { ModelPrivate } from '../editor-model/model-private';
import { contentDidChange } from '../editor-model/listeners';

export class LatexModeEditor extends ModeEditor {
  constructor() {
    super('latex');
  }

  createAtom(command: string, _style: Style): Atom | null {
    return new LatexAtom(command);
  }

  onPaste(mathfield: MathfieldPrivate, ev: ClipboardEvent): boolean {
    if (!ev.clipboardData) return false;
    const text = ev.clipboardData.getData('text/plain');

    if (text) {
      mathfield.snapshot();
      if (this.insert(mathfield.model, text)) {
        requestUpdate(mathfield);
      }

      ev.preventDefault();
      ev.stopPropagation();
      return true;
    }

    return false;
  }

  insert(model: ModelPrivate, text: string, options?: InsertOptions): boolean {
    if (!options) options = {};
    if (!options.insertionMode) options.insertionMode = 'replaceSelection';
    if (!options.selectionMode) options.selectionMode = 'placeholder';

    const { suppressChangeNotifications } = model;
    if (options.suppressChangeNotifications) {
      model.suppressChangeNotifications = true;
    }

    const savedSuppressChangeNotifications = model.suppressChangeNotifications;
    model.suppressChangeNotifications = true;

    // Delete any selected items
    if (
      options.insertionMode === 'replaceSelection' &&
      !model.selectionIsCollapsed
    ) {
      model.position = model.deleteAtoms(range(model.selection));
    } else if (options.insertionMode === 'replaceAll') {
      model.root.setChildren([], 'body');
      model.position = 0;
    } else if (options.insertionMode === 'insertBefore') {
      model.collapseSelection('backward');
    } else if (options.insertionMode === 'insertAfter') {
      model.collapseSelection('forward');
    }

    // Short-circuit the tokenizer and parser when in Latex mode
    const newAtoms: Atom[] = [];
    for (const c of text) {
      if (COMMAND_MODE_CHARACTERS.test(c)) {
        newAtoms.push(new LatexAtom(c));
      }
    }

    //
    // Insert the new atoms
    //
    let cursor = model.at(model.position);
    // In some cases (after a SelectAll command, for example), the cursor
    // can be positoned *after* the LatexGroup. In that case, adjust to be
    // the last atom inside the LatexGroup.
    if (cursor instanceof LatexGroupAtom) cursor = cursor.lastChild;
    const lastNewAtom = cursor.parent!.addChildrenAfter(newAtoms, cursor);

    // Prepare to dispatch notifications
    model.suppressChangeNotifications = savedSuppressChangeNotifications;

    if (options.selectionMode === 'before') {
      // Do nothing: don't change the position.
    } else if (options.selectionMode === 'item') {
      model.setSelection(model.anchor, model.offsetOf(lastNewAtom));
    } else if (lastNewAtom) {
      model.position = model.offsetOf(lastNewAtom);
    }

    contentDidChange(model);

    model.suppressChangeNotifications = suppressChangeNotifications;

    return true;
  }
}

export function getLatexGroup(model: ModelPrivate): LatexGroupAtom | undefined {
  return model.atoms.find((x) => x instanceof LatexGroupAtom);
}

export function getLatexGroupBody(model: ModelPrivate): LatexAtom[] {
  const atom = model.atoms.find((x) => x instanceof LatexGroupAtom);
  if (!atom) return [];
  return (
    (atom.body?.filter((x) => x instanceof LatexAtom) as LatexAtom[]) ?? []
  );
}

export function getCommandSuggestionRange(
  model: ModelPrivate,
  options?: { before: Offset }
): Range | [undefined, undefined] {
  let start = 0;
  let found = false;
  const last = Number.isFinite(options?.before)
    ? options?.before ?? 0
    : model.lastOffset;
  while (start <= last && !found) {
    const atom = model.at(start);
    found = atom instanceof LatexAtom && atom.isSuggestion;
    if (!found) start++;
  }

  if (!found) return [undefined, undefined];

  let end = start;
  let done = false;
  while (end <= last && !done) {
    const atom = model.at(end);
    done = !(atom instanceof LatexAtom && atom.isSuggestion);
    if (!done) end++;
  }

  return [start - 1, end - 1];
}

new LatexModeEditor();
