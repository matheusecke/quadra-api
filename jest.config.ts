export default {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testMatch: ['<rootDir>/**/*.service.spec.ts'],
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  collectCoverageFrom: [
    '<rootDir>/**/*.service.ts',
    '!<rootDir>/prisma/**/*.service.ts',
  ],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
  testPathIgnorePatterns: ['/node_modules/', '/test/', '\\.e2e-spec\\.ts$'],
  passWithNoTests: true,
};
