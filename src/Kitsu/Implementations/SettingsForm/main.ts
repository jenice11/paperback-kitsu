/* SPDX-License-Identifier: GPL-3.0-or-later */

import type { Form, SettingsFormProviding } from "@paperback/types";

import { SettingsForm } from "./form";

export class SettingsFormImplementation implements SettingsFormProviding {
  async getSettingsForm(): Promise<Form> {
    return new SettingsForm();
  }
}
