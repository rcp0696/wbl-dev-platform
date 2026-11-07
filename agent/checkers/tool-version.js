const { execFile } = require('child_process');
const { promisify } = require('util');
const { satisfies } = require('./version');
const execFileAsync = promisify(execFile);

async function check(requirement) {
  try {
    const { stdout, stderr } = await execFileAsync(
      requirement.command,
      Array.isArray(requirement.args) ? requirement.args : [],
      { timeout: 5000, windowsHide: true, shell: false, maxBuffer: 65536 }
    );
    const output = `${stdout || ''} ${stderr || ''}`.trim();
    const operator = requirement.operator || '>=';
    const comparison = satisfies(output, requirement.expected_value, operator);
    if (comparison.error === 'expected') {
      return { status: 'ERROR', detected_value: null, message: `Requirement's expected version "${requirement.expected_value}" is not a valid version` };
    }
    if (!comparison.actual) {
      return { status: 'ERROR', detected_value: null, message: `Could not parse a version from: ${output.slice(0, 120)}` };
    }
    return {
      status: comparison.ok ? 'PASS' : 'FAIL',
      detected_value: comparison.actual,
      message: comparison.ok
        ? `${requirement.name} satisfies ${operator} ${requirement.expected_value}`
        : `${requirement.name} ${comparison.actual} does not satisfy ${operator} ${requirement.expected_value}`
    };
  } catch {
    return { status: 'FAIL', detected_value: null, message: `${requirement.name} was not found or could not be executed` };
  }
}

module.exports = { check };
