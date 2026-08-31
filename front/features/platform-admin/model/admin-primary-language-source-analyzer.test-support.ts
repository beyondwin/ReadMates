import ts from "typescript";

const BANNED_PRIMARY_TERMS = ["Today", "Club registry", "Pipeline", "Ledger", "Job", "Event"] as const;
const RAW_PRIMARY_FIELDS = new Set(["role", "status", "outcome", "refreshState", "stage"]);

export type AdminPrimaryLanguageViolation = Readonly<{
  line: number;
  reason: string;
}>;

export type AdminPrimaryLanguageAnalysis = Readonly<{
  violations: AdminPrimaryLanguageViolation[];
  technicalDisclosureCount: number;
}>;

export function analyzeAdminPrimaryLanguageSource(
  source: string,
  fileName = "source.tsx",
): AdminPrimaryLanguageAnalysis {
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const technicalDisclosureBindings = collectTechnicalDisclosureBindings(sourceFile);
  const staticBindings = collectStaticBindings(sourceFile);
  const rawBindings = collectRawBindings(sourceFile);
  const violations: AdminPrimaryLanguageViolation[] = [];
  let technicalDisclosureCount = 0;

  const report = (node: ts.Node, reason: string) => {
    const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
    violations.push({ line, reason });
  };

  const inspectStatic = (node: ts.Node) => {
    const value = evaluateStaticString(node, staticBindings);
    if (value == null) return;
    const term = BANNED_PRIMARY_TERMS.find((candidate) => value.includes(candidate));
    if (term) report(node, `primary copy contains ${term}`);
  };

  const visit = (node: ts.Node) => {
    if (ts.isJsxSelfClosingElement(node) || ts.isJsxElement(node)) {
      const tagName = ts.isJsxSelfClosingElement(node)
        ? node.tagName.getText(sourceFile)
        : node.openingElement.tagName.getText(sourceFile);
      if (technicalDisclosureBindings.has(tagName)) {
        technicalDisclosureCount += 1;
        return;
      }
    }

    if (ts.isJsxText(node)) inspectStatic(node);
    if (ts.isJsxAttribute(node) && node.initializer) inspectStatic(node.initializer);
    if (ts.isJsxExpression(node) && node.expression) {
      inspectStatic(node.expression);
      if (!ts.isJsxAttribute(node.parent) && isRawPrimaryExpression(node.expression, rawBindings)) {
        report(node.expression, "raw role/status value rendered in primary UI");
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return { violations, technicalDisclosureCount };
}

function collectTechnicalDisclosureBindings(sourceFile: ts.SourceFile): Set<string> {
  const bindings = new Set<string>();
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    if (!ts.isStringLiteral(statement.moduleSpecifier)) continue;
    if (statement.moduleSpecifier.text !== "@/features/platform-admin/ui/admin-technical-disclosure") continue;
    const namedBindings = statement.importClause?.namedBindings;
    if (!namedBindings || !ts.isNamedImports(namedBindings)) continue;
    for (const element of namedBindings.elements) {
      if ((element.propertyName ?? element.name).text === "AdminTechnicalDisclosure") {
        bindings.add(element.name.text);
      }
    }
  }
  return bindings;
}

function collectStaticBindings(sourceFile: ts.SourceFile): Map<string, ts.Expression> {
  const bindings = new Map<string, ts.Expression>();
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      bindings.set(node.name.text, node.initializer);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return bindings;
}

function collectRawBindings(sourceFile: ts.SourceFile): Set<string> {
  const bindings = new Set<string>();
  const visit = (node: ts.Node) => {
    if (ts.isBindingElement(node) && ts.isIdentifier(node.name)) {
      const property = node.propertyName ?? node.name;
      if (ts.isIdentifier(property) && RAW_PRIMARY_FIELDS.has(property.text)) bindings.add(node.name.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return bindings;
}

function evaluateStaticString(
  node: ts.Node,
  bindings: ReadonlyMap<string, ts.Expression>,
  seen = new Set<string>(),
): string | null {
  if (ts.isStringLiteralLike(node) || ts.isJsxText(node)) return node.text;
  if (ts.isJsxExpression(node)) return node.expression ? evaluateStaticString(node.expression, bindings, seen) : "";
  if (ts.isJsxAttribute(node)) return node.initializer ? evaluateStaticString(node.initializer, bindings, seen) : "";
  if (ts.isIdentifier(node)) {
    if (seen.has(node.text)) return null;
    const binding = bindings.get(node.text);
    if (!binding) return null;
    const nextSeen = new Set(seen).add(node.text);
    return evaluateStaticString(binding, bindings, nextSeen);
  }
  if (ts.isParenthesizedExpression(node)) return evaluateStaticString(node.expression, bindings, seen);
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = evaluateStaticString(node.left, bindings, seen);
    const right = evaluateStaticString(node.right, bindings, seen);
    return left == null || right == null ? null : left + right;
  }
  if (ts.isTemplateExpression(node)) {
    let value = node.head.text;
    for (const span of node.templateSpans) {
      const expression = evaluateStaticString(span.expression, bindings, seen);
      if (expression == null) return null;
      value += expression + span.literal.text;
    }
    return value;
  }
  return null;
}

function isRawPrimaryExpression(node: ts.Expression, rawBindings: ReadonlySet<string>): boolean {
  if (ts.isIdentifier(node)) return rawBindings.has(node.text);
  if (ts.isPropertyAccessExpression(node)) return RAW_PRIMARY_FIELDS.has(node.name.text);
  if (ts.isElementAccessExpression(node) && node.argumentExpression && ts.isStringLiteral(node.argumentExpression)) {
    return RAW_PRIMARY_FIELDS.has(node.argumentExpression.text);
  }
  if (ts.isConditionalExpression(node)) {
    return isRawPrimaryExpression(node.whenTrue, rawBindings) || isRawPrimaryExpression(node.whenFalse, rawBindings);
  }
  if (ts.isBinaryExpression(node)) {
    return isRawPrimaryExpression(node.left, rawBindings) || isRawPrimaryExpression(node.right, rawBindings);
  }
  if (ts.isTemplateExpression(node)) {
    return node.templateSpans.some((span) => isRawPrimaryExpression(span.expression, rawBindings));
  }
  return false;
}
