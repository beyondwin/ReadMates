import ts from "typescript";

const BANNED_PRIMARY_TERMS = ["Today", "Club registry", "Pipeline", "Ledger", "Job", "Event"] as const;
const RAW_PRIMARY_FIELDS = new Set(["role", "status", "outcome", "refreshState", "stage"]);
const TECHNICAL_DISCLOSURE_NAME = "AdminTechnicalDisclosure";
const TECHNICAL_DISCLOSURE_MODULE = "@/features/platform-admin/ui/admin-technical-disclosure";

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
  const { sourceFile, checker } = createSourceContext(source, fileName);
  const technicalDisclosureProvenance = collectTechnicalDisclosureProvenance(sourceFile, checker);
  const staticBindings = collectStaticBindings(sourceFile);
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

  const inspectDisclosureCandidateAttributes = (attributes: ts.JsxAttributes) => {
    for (const attribute of attributes.properties) {
      if (ts.isJsxAttribute(attribute)) {
        const initializer = attribute.initializer;
        if (
          initializer
          && ts.isJsxExpression(initializer)
          && initializer.expression
          && isRawPrimaryExpression(initializer.expression, checker)
        ) {
          report(initializer.expression, "raw role/status value rendered in primary UI");
        }
        continue;
      }
      if (isRawPrimaryExpression(attribute.expression, checker)) {
        report(attribute.expression, "raw role/status value rendered in primary UI");
      }
    }
  };

  const visit = (node: ts.Node) => {
    if (ts.isJsxSelfClosingElement(node) || ts.isJsxElement(node)) {
      const opening = ts.isJsxSelfClosingElement(node) ? node : node.openingElement;
      const provenance = classifyTechnicalDisclosureTag(
        opening.tagName,
        checker,
        technicalDisclosureProvenance,
      );
      if (provenance === "canonical") {
        technicalDisclosureCount += 1;
        return;
      }
      if (provenance === "candidate") inspectDisclosureCandidateAttributes(opening.attributes);
    }

    if (ts.isJsxText(node)) inspectStatic(node);
    if (ts.isJsxAttribute(node) && node.initializer) inspectStatic(node.initializer);
    if (ts.isJsxExpression(node) && node.expression) {
      inspectStatic(node.expression);
      if (!ts.isJsxAttribute(node.parent) && isRawPrimaryExpression(node.expression, checker)) {
        report(node.expression, "raw role/status value rendered in primary UI");
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return { violations, technicalDisclosureCount };
}

function createSourceContext(source: string, fileName: string): {
  sourceFile: ts.SourceFile;
  checker: ts.TypeChecker;
} {
  const options: ts.CompilerOptions = {
    jsx: ts.JsxEmit.Preserve,
    noLib: true,
    noResolve: true,
    target: ts.ScriptTarget.Latest,
  };
  const sourceFile = ts.createSourceFile(fileName, source, options.target!, true, ts.ScriptKind.TSX);
  const host = ts.createCompilerHost(options, true);
  host.fileExists = (requestedFileName) => requestedFileName === fileName;
  host.readFile = (requestedFileName) => requestedFileName === fileName ? source : undefined;
  host.getSourceFile = (requestedFileName) => requestedFileName === fileName ? sourceFile : undefined;
  host.writeFile = () => undefined;
  const program = ts.createProgram({ rootNames: [fileName], options, host });
  const boundSourceFile = program.getSourceFile(fileName);
  if (!boundSourceFile) throw new Error(`Unable to bind source file: ${fileName}`);
  return { sourceFile: boundSourceFile, checker: program.getTypeChecker() };
}

type TechnicalDisclosureProvenance = Readonly<{
  canonicalBindings: ReadonlySet<ts.Symbol>;
  candidateNames: ReadonlySet<string>;
}>;

function collectTechnicalDisclosureProvenance(
  sourceFile: ts.SourceFile,
  checker: ts.TypeChecker,
): TechnicalDisclosureProvenance {
  const canonicalBindings = new Set<ts.Symbol>();
  const candidateNames = new Set<string>([TECHNICAL_DISCLOSURE_NAME]);
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    if (!ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const namedBindings = statement.importClause?.namedBindings;
    if (!namedBindings || !ts.isNamedImports(namedBindings)) continue;
    for (const element of namedBindings.elements) {
      if ((element.propertyName ?? element.name).text !== TECHNICAL_DISCLOSURE_NAME) continue;
      candidateNames.add(element.name.text);
      if (statement.moduleSpecifier.text !== TECHNICAL_DISCLOSURE_MODULE) continue;
      const symbol = checker.getSymbolAtLocation(element.name);
      if (symbol) canonicalBindings.add(symbol);
    }
  }
  return { canonicalBindings, candidateNames };
}

function classifyTechnicalDisclosureTag(
  tagName: ts.JsxTagNameExpression,
  checker: ts.TypeChecker,
  provenance: TechnicalDisclosureProvenance,
): "canonical" | "candidate" | "other" {
  if (!ts.isIdentifier(tagName)) return "other";
  const binding = checker.getSymbolAtLocation(tagName);
  if (binding && provenance.canonicalBindings.has(binding)) return "canonical";
  return provenance.candidateNames.has(tagName.text) ? "candidate" : "other";
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

function isRawPrimaryExpression(
  node: ts.Expression,
  checker: ts.TypeChecker,
  seenBindings = new Set<ts.Symbol>(),
): boolean {
  if (ts.isIdentifier(node)) {
    const binding = checker.getSymbolAtLocation(node);
    if (!binding || seenBindings.has(binding)) return false;
    const nextSeen = new Set(seenBindings).add(binding);
    return binding.declarations?.some((declaration) => isRawBindingDeclaration(declaration, checker, nextSeen)) ?? false;
  }
  if (
    ts.isParenthesizedExpression(node)
    || ts.isAsExpression(node)
    || ts.isTypeAssertionExpression(node)
    || ts.isNonNullExpression(node)
    || ts.isSatisfiesExpression(node)
  ) {
    return isRawPrimaryExpression(node.expression, checker, seenBindings);
  }
  if (ts.isPropertyAccessExpression(node)) return RAW_PRIMARY_FIELDS.has(node.name.text);
  if (ts.isElementAccessExpression(node) && node.argumentExpression && ts.isStringLiteral(node.argumentExpression)) {
    return RAW_PRIMARY_FIELDS.has(node.argumentExpression.text);
  }
  if (ts.isConditionalExpression(node)) {
    return isRawPrimaryExpression(node.whenTrue, checker, seenBindings)
      || isRawPrimaryExpression(node.whenFalse, checker, seenBindings);
  }
  if (ts.isBinaryExpression(node)) {
    return isRawPrimaryExpression(node.left, checker, seenBindings)
      || isRawPrimaryExpression(node.right, checker, seenBindings);
  }
  if (ts.isTemplateExpression(node)) {
    return node.templateSpans.some((span) => isRawPrimaryExpression(span.expression, checker, seenBindings));
  }
  if (ts.isArrayLiteralExpression(node)) {
    return node.elements.some((element) => {
      if (ts.isOmittedExpression(element)) return false;
      if (ts.isSpreadElement(element)) return isRawPrimaryExpression(element.expression, checker, seenBindings);
      return isRawPrimaryExpression(element, checker, seenBindings);
    });
  }
  if (ts.isObjectLiteralExpression(node)) {
    return node.properties.some((property) => {
      if (ts.isPropertyAssignment(property)) {
        return isRawPrimaryExpression(property.initializer, checker, seenBindings);
      }
      if (ts.isShorthandPropertyAssignment(property)) {
        return isRawPrimaryExpression(property.name, checker, seenBindings)
          || Boolean(property.objectAssignmentInitializer
            && isRawPrimaryExpression(property.objectAssignmentInitializer, checker, seenBindings));
      }
      if (ts.isSpreadAssignment(property)) {
        return isRawPrimaryExpression(property.expression, checker, seenBindings);
      }
      return false;
    });
  }
  if (ts.isCallExpression(node)) {
    if (ts.isIdentifier(node.expression) && node.expression.text === "String") {
      return node.arguments.some((argument) => isRawPrimaryExpression(argument, checker, seenBindings));
    }
    if (
      ts.isPropertyAccessExpression(node.expression)
      && node.expression.name.text === "toString"
      && node.arguments.length === 0
    ) {
      return isRawPrimaryExpression(node.expression.expression, checker, seenBindings);
    }
  }
  return false;
}

function isRawBindingDeclaration(
  declaration: ts.Declaration,
  checker: ts.TypeChecker,
  seenBindings: ReadonlySet<ts.Symbol>,
): boolean {
  if (ts.isBindingElement(declaration)) {
    const propertyName = declaration.propertyName ?? declaration.name;
    if (
      (ts.isIdentifier(propertyName) || ts.isStringLiteralLike(propertyName))
      && RAW_PRIMARY_FIELDS.has(propertyName.text)
    ) {
      return true;
    }
    return Boolean(
      declaration.initializer
      && isRawPrimaryExpression(declaration.initializer, checker, new Set(seenBindings)),
    );
  }
  if (ts.isVariableDeclaration(declaration) || ts.isParameter(declaration)) {
    return Boolean(
      declaration.initializer
      && isRawPrimaryExpression(declaration.initializer, checker, new Set(seenBindings)),
    );
  }
  return false;
}
