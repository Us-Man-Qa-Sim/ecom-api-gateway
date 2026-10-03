import { NotFoundException } from '@nestjs/common';
import { Role as ProtoRole } from '@us-man-qa-sim/ecom-contracts/generated/user';
import { UsersController } from '../../src/routes/users/users.controller';
import {
  expectMetadata,
  makeMetadataFactory,
  makeTimeouts,
  makeUserClient,
  okObs,
} from './_helpers';

const sampleUser = {
  id: 'u-1',
  email: 'a@b.com',
  firstName: 'A',
  lastName: 'B',
  role: ProtoRole.ROLE_CUSTOMER,
  createdAt: { seconds: 1_700_000_000, nanos: 0 },
  updatedAt: { seconds: 1_700_000_000, nanos: 0 },
};

const sampleAddress = {
  id: 'a-1',
  userId: 'u-1',
  label: 'home',
  street: '1 lane',
  city: 'city',
  state: undefined,
  postalCode: '00000',
  country: 'FR',
  isDefault: true,
  createdAt: { seconds: 1_700_000_000, nanos: 0 },
  updatedAt: { seconds: 1_700_000_000, nanos: 0 },
};

describe('UsersController', () => {
  describe('getMe', () => {
    it('returns the authenticated user and forwards identity metadata', async () => {
      const getMe = okObs({ user: sampleUser });
      const ctrl = new UsersController(
        makeUserClient({ getMe }),
        makeMetadataFactory({ userId: 'u-1', role: 'CUSTOMER' }),
        makeTimeouts(),
      );
      const result = await ctrl.getMe();
      expectMetadata(getMe, { 'x-user-id': 'u-1', 'x-user-role': 'CUSTOMER' });
      expect(result).toMatchObject({ id: 'u-1', email: 'a@b.com', role: 'CUSTOMER' });
    });

    it('404s when user-service returns no user', async () => {
      const getMe = okObs({ user: undefined });
      const ctrl = new UsersController(
        makeUserClient({ getMe }),
        makeMetadataFactory({ userId: 'u-1', role: 'CUSTOMER' }),
        makeTimeouts(),
      );
      await expect(ctrl.getMe()).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('addresses', () => {
    const metadata = makeMetadataFactory({ userId: 'u-1', role: 'CUSTOMER' });

    it('lists addresses', async () => {
      const listAddresses = okObs({ addresses: [sampleAddress] });
      const ctrl = new UsersController(
        makeUserClient({ listAddresses }),
        metadata,
        makeTimeouts(),
      );
      const result = await ctrl.listAddresses();
      expect(result.addresses).toHaveLength(1);
      expect(result.addresses[0]).toMatchObject({ id: 'a-1', isDefault: true });
    });

    it('creates an address with isDefault defaulting to false', async () => {
      const createAddress = okObs({ address: sampleAddress });
      const ctrl = new UsersController(
        makeUserClient({ createAddress }),
        metadata,
        makeTimeouts(),
      );
      await ctrl.createAddress({
        street: '1 lane',
        city: 'city',
        postalCode: '00000',
        country: 'FR',
      });
      expect(createAddress.mock.calls[0][0]).toMatchObject({ isDefault: false });
    });

    it('forwards isDefault when the client explicitly set it', async () => {
      const createAddress = okObs({ address: sampleAddress });
      const ctrl = new UsersController(
        makeUserClient({ createAddress }),
        metadata,
        makeTimeouts(),
      );
      await ctrl.createAddress({
        street: '1 lane',
        city: 'city',
        postalCode: '00000',
        country: 'FR',
        isDefault: true,
      });
      expect(createAddress.mock.calls[0][0]).toMatchObject({ isDefault: true });
    });

    it('deletes an address and returns 204', async () => {
      const deleteAddress = okObs({});
      const ctrl = new UsersController(
        makeUserClient({ deleteAddress }),
        metadata,
        makeTimeouts(),
      );
      await expect(ctrl.deleteAddress('a-1')).resolves.toBeUndefined();
      expect(deleteAddress.mock.calls[0][0]).toEqual({ addressId: 'a-1' });
    });
  });
});
