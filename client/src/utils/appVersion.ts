import pkg from '../../package.json'

const version = typeof pkg?.version === 'string' ? pkg.version : '1.0.0'

export const APP_VERSION = version
