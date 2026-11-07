async function check(requirement) {
  const name = requirement.expected_value;
  const present = Boolean(process.env[name]);
  return {
    status: present ? 'PASS' : 'FAIL',
    detected_value: null,
    message: present ? `Required environment variable ${name} is present` : `Required environment variable ${name} is missing`
  };
}
module.exports = { check };
