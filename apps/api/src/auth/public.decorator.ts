import { SetMetadata } from '@nestjs/common';

/** The only opt-out from the global session guard; undecorated routes stay protected. */
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
