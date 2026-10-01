import { BadRequestException } from '@nestjs/common';
import { status as GrpcStatus } from '@grpc/grpc-js';
import { AuthController } from '../../src/routes/auth/auth.controller';
import { Role as ProtoRole } from '@us-man-qa-sim/ecom-contracts/generated/user';
import { errObs, expectMetadata, makeMetadataFactory, makeUserClient, okObs } from './_helpers';

function controllerWithRegister(registerMock: jest.Mock): AuthController {
  return new AuthController(
    makeUserClient({ register: registerMock }),
    makeMetadataFactory({ requestId: 'req-abc' }),
  );
}

describe('AuthController', () => {
  const sampleUser = {
    id: 'u-1',
    email: 'a@b.com',
    firstName: 'A',
    lastName: 'B',
    role: ProtoRole.ROLE_CUSTOMER,
    createdAt: { seconds: 1_700_000_000, nanos: 0 },
    updatedAt: { seconds: 1_700_000_000, nanos: 0 },
  };

  describe('register', () => {
    it('forwards the request and maps the user', async () => {
      const register = okObs({ user: sampleUser, tokens: undefined });
      const ctrl = controllerWithRegister(register);

      const result = await ctrl.register({
        email: 'a@b.com',
        password: 'pw',
        firstName: 'A',
        lastName: 'B',
      });

      expect(register).toHaveBeenCalledTimes(1);
      expect(register.mock.calls[0][0]).toEqual({
        email: 'a@b.com',
        password: 'pw',
        firstName: 'A',
        lastName: 'B',
      });
      expectMetadata(register, { 'x-request-id': 'req-abc' });
      expect(result).toMatchObject({
        user: { id: 'u-1', email: 'a@b.com', role: 'CUSTOMER' },
        tokens: null,
      });
    });

    it('rejects a non-object body with 400', async () => {
      const ctrl = controllerWithRegister(jest.fn());
      await expect(ctrl.register('not-json')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects missing email with 400', async () => {
      const ctrl = controllerWithRegister(jest.fn());
      await expect(
        ctrl.register({ password: 'pw', firstName: 'A', lastName: 'B' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('login', () => {
    it('returns tokens on success', async () => {
      const login = okObs({
        user: sampleUser,
        tokens: {
          accessToken: 'at',
          refreshToken: 'rt',
          accessTokenExpiresAt: { seconds: 1_700_000_900, nanos: 0 },
        },
      });
      const ctrl = new AuthController(makeUserClient({ login }), makeMetadataFactory());
      const result = await ctrl.login({ email: 'a@b.com', password: 'pw' });
      expect(result.tokens).toMatchObject({ accessToken: 'at', refreshToken: 'rt' });
      expect(result.user.role).toBe('CUSTOMER');
    });

    it('surfaces downstream UNAUTHENTICATED', async () => {
      const login = errObs(GrpcStatus.UNAUTHENTICATED, 'bad credentials');
      const ctrl = new AuthController(makeUserClient({ login }), makeMetadataFactory());
      await expect(ctrl.login({ email: 'a@b.com', password: 'pw' })).rejects.toMatchObject({
        code: GrpcStatus.UNAUTHENTICATED,
      });
    });
  });

  describe('refresh', () => {
    it('returns refreshed tokens', async () => {
      const refreshToken = okObs({
        tokens: {
          accessToken: 'at2',
          refreshToken: 'rt2',
          accessTokenExpiresAt: undefined,
        },
      });
      const ctrl = new AuthController(makeUserClient({ refreshToken }), makeMetadataFactory());
      const result = await ctrl.refresh({ refreshToken: 'rt' });
      expect(result.tokens.accessToken).toBe('at2');
      expect(result.tokens.accessTokenExpiresAt).toBeNull();
    });

    it('requires refreshToken', async () => {
      const ctrl = new AuthController(
        makeUserClient({ refreshToken: jest.fn() }),
        makeMetadataFactory(),
      );
      await expect(ctrl.refresh({})).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('logout', () => {
    it('calls logout and returns nothing', async () => {
      const logout = okObs({});
      const ctrl = new AuthController(makeUserClient({ logout }), makeMetadataFactory());
      await expect(ctrl.logout({ refreshToken: 'rt' })).resolves.toBeUndefined();
      expect(logout).toHaveBeenCalledTimes(1);
    });
  });
});
