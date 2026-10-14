/* SPDX-License-Identifier: GPL-3.0-or-later */

type Constructor = { prototype: object };

/** Copies the methods of each feature class onto the extension class. */
export function applyMixins(derivedCtor: Constructor, constructors: Constructor[]): void {
  for (const baseCtor of constructors) {
    for (const name of Object.getOwnPropertyNames(baseCtor.prototype)) {
      const descriptor = Object.getOwnPropertyDescriptor(baseCtor.prototype, name);
      if (name !== "constructor" && descriptor != null) {
        Object.defineProperty(derivedCtor.prototype, name, descriptor);
      }
    }
  }
}
