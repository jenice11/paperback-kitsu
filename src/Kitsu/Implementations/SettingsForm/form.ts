/* SPDX-License-Identifier: GPL-3.0-or-later */

import {
  ButtonRow,
  Form,
  InputRow,
  LabelRow,
  type ListSectionElement,
  NavigationRow,
  Section,
} from "@paperback/types";

import { login } from "../../Services/Requests";
import { session } from "../Shared/parser/main";

interface LoginInput {
  username: string;
  password: string;
}

class LoginForm extends Form {
  override requiresExplicitSubmission = true;

  loginForm: LoginInput = { username: "", password: "" };

  constructor(private readonly onLoggedIn: () => void) {
    super();
  }

  override formWillDisappear(): void {
    this.resetFormFields();
  }

  override getSections() {
    return [
      Section(
        {
          id: "login-section",
          header: "Log in",
          footer:
            "Use your Kitsu email and password. Your password is only sent to Kitsu to get an access token and is never stored by this extension.",
        },
        [
          InputRow("username-input", {
            title: "Email",
            value: this.loginForm.username,
            onValueChange: Application.Selector(this as LoginForm, "onUsernameChange"),
          }),
          InputRow("password-input", {
            title: "Password",
            value: this.loginForm.password,
            isSecureEntry: true,
            onValueChange: Application.Selector(this as LoginForm, "onPasswordChange"),
          }),
        ],
      ),
    ];
  }

  async onUsernameChange(newUsername: string) {
    this.loginForm.username = newUsername;
  }

  async onPasswordChange(newPassword: string) {
    this.loginForm.password = newPassword;
  }

  override async formDidSubmit(): Promise<void> {
    const username = this.loginForm.username.trim();
    const password = this.loginForm.password;
    if (!username || !password) {
      throw new Error("Must provide a username and password!");
    }

    await login(username, password);
    this.resetFormFields();
    this.onLoggedIn();
  }

  private resetFormFields(): void {
    this.loginForm = { username: "", password: "" };
  }
}

export class SettingsForm extends Form {
  override getSections() {
    const current = session.getSession();
    return current == null ? this.unauthenticatedView() : this.getProfileSection(current.username);
  }

  private unauthenticatedView(): ListSectionElement[] {
    return [
      Section(
        {
          id: "login-section",
          footer: "Log in to Kitsu to sync your reading progress.",
        },
        [
          NavigationRow("login", {
            title: "Log in",
            form: new LoginForm(() => this.reloadForm()),
          }),
        ],
      ),
    ];
  }

  private getProfileSection(username: string | undefined): ListSectionElement[] {
    return [
      Section({ id: "profile-section", header: "Profile" }, [
        LabelRow("user-name", {
          title: "Username",
          value: username ?? "-",
        }),
        ButtonRow("logout-button", {
          title: "Log out",
          onSelect: Application.Selector(this as SettingsForm, "logOut"),
        }),
      ]),
    ];
  }

  async logOut(): Promise<void> {
    session.clearSession();
    this.reloadForm();
  }
}
