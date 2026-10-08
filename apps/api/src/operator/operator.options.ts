export const OPERATOR_OPTIONS = Symbol('OPERATOR_OPTIONS');

export interface OperatorOptions {
  /** Public URL of the web app, for the invitation links. */
  appUrl: string;
}
