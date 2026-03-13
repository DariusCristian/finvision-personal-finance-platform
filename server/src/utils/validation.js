export const mapZodIssues = (issues = []) =>
  issues.map((issue) => ({
    path: issue.path.join('.'),
    code: issue.code,
    message: issue.message,
  }));
