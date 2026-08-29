import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateCouponDto } from './create-coupon.dto';

export class UpdateCouponDto extends OmitType(PartialType(CreateCouponDto), ['code'] as const) {}
