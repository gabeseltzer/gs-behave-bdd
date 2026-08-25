// "Run Tests With Tag..." - running a behave suite the way it is organised.
//
// Tags are the organising idea of a behave suite (@wip, @smoke, @slow), and until now
// there was no way to run by one: --tags is not exposed, and the Test Explorer's filter
// box does not take tags either - its terms are exactly ["@failed", "@executed", "@doc",
// "@openedFiles", "@hidden"]. Tags on a TestItem gate tag-scoped run profiles, which is a
// good fit for a handful of known tags and a bad one for a suite that invents them
// freely: every tag would need its own profile in the run dropdown.
//
// A command sidesteps that. It reads the tags already on the tree, asks which one, and
// runs the items carrying it.

import * as vscode from 'vscode';


/** Every distinct tag on the tree, sorted, for offering to the user. */
export function collectTags(items: vscode.TestItemCollection): string[] {
  const tags = new Set<string>();
  const visit = (collection: vscode.TestItemCollection) => {
    collection.forEach(item => {
      for (const tag of item.tags)
        tags.add(tag.id);
      visit(item.children);
    });
  };
  visit(items);
  return [...tags].sort((a, b) => a.localeCompare(b));
}


/**
 * The items to run for a tag: the TOP-MOST carriers, not every carrier.
 *
 * Tags are inherited, so a tag on a Feature is also on all of its scenarios. Returning
 * both the feature and its scenarios would be redundant - the run queue expands a parent
 * into its children anyway - and would make the request describe the same work twice.
 * Taking the top-most carrier and not descending into it keeps the request minimal and
 * still covers everything the tag reaches.
 */
export function collectItemsWithTag(items: vscode.TestItemCollection, tag: string): vscode.TestItem[] {
  const matched: vscode.TestItem[] = [];
  const visit = (collection: vscode.TestItemCollection) => {
    collection.forEach(item => {
      if (item.tags.some(t => t.id === tag)) {
        matched.push(item);
        return; // its descendants inherit this tag; the parent covers them
      }
      visit(item.children);
    });
  };
  visit(items);
  return matched;
}
