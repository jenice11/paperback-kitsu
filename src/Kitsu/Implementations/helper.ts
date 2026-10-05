/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Inkdex */

export function applyMixins(derivedCtor: any, constructors: any[]) {
  for (const baseCtor of constructors) {
    for (const [name, descriptor] of Object.entries(
      Object.getOwnPropertyDescriptors(baseCtor.prototype),
    )) {
      if (name !== "constructor") {
        Object.defineProperty(derivedCtor.prototype, name, descriptor);
      }
    }
  }
}
