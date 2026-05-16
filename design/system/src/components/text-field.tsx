import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cx } from "./classnames";

export type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
};

export type TextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: string;
};

export function TextField({ label, id, className, ...props }: TextFieldProps) {
  const input = <input {...props} id={id} className={cx("input", className)} />;

  if (!label) {
    return input;
  }

  return (
    <label>
      <span className="label">{label}</span>
      {input}
    </label>
  );
}

export function TextArea({ label, id, className, ...props }: TextAreaProps) {
  const textarea = <textarea {...props} id={id} className={cx("textarea", className)} />;

  if (!label) {
    return textarea;
  }

  return (
    <label>
      <span className="label">{label}</span>
      {textarea}
    </label>
  );
}
