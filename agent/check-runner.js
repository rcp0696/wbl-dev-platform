const checkers = {
  tool_version: require('./checkers/tool-version'),
  env_var: require('./checkers/env-var'),
  file: require('./checkers/file')
};

async function runRequirement(requirement) {
  const base = { requirement_id: requirement.id, detected_value: null, message: '' };
  const checker = checkers[requirement.type];
  if (!checker) return { ...base, status: 'ERROR', message: `Unsupported type: ${requirement.type}` };
  try {
    const result = await checker.check(requirement);
    return { ...base, status: result.status, detected_value: result.detected_value ?? null, message: result.message || '' };
  } catch {
    return { ...base, status: 'ERROR', message: 'Unexpected verification error' };
  }
}

module.exports = { runRequirement };
