import { BadRequestException, Injectable } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';

@Injectable()
export class CommonHelperService {
  constructor() {}

  public generateRandomNumericValue() {
    const result = Math.floor(100000 + Math.random() * 900000).toString(); // Simple OTP generation
    return result;
  }

  public generateJwtToken(payload: { id: string; email: string }): {
    access_token: string;
    refresh_token: string;
  } {
    const access_token = jwt.sign(payload, `${process.env.ACCESS_JWT_SECRET}`, {
      expiresIn: '24h',
    });

    const refresh_token = jwt.sign(
      payload,
      `${process.env.REFRESH_JWT_SECRET}`,
      { expiresIn: '7d' },
    );
    return { access_token, refresh_token };
  }

  public calculateGovernmentFee(
    visaRequired: number, // Total visa quota selected
    visaActivated: number, // Number of visas activated
    usersResideInUae: number, // Number of applicants inside UAE among activated visas,
    additionalVisaFee: number,
    baseLicenseFee = 12900,
    visaActivationFee = 4950,
    establishmentCardFee = 2000,
    resideInUaeAdditionalFee = 1600,
  ) {
    // 1. License Fee Calculation
    const licenseFee =
      visaRequired === 0
        ? baseLicenseFee
        : baseLicenseFee + visaRequired * additionalVisaFee;

    // 2. Visa Activation Fees
    const totalVisaActivationFee = visaActivated * visaActivationFee;

    // 3. Establishment Card Fee (only if at least one visa is activated)
    const establishmentCard = visaActivated > 0 ? establishmentCardFee : 0;

    // 4. Additional fee for applicants residing in UAE
    const totalResideInUaeFee = usersResideInUae * resideInUaeAdditionalFee;

    // Total government fees
    const total =
      licenseFee +
      totalVisaActivationFee +
      establishmentCard +
      totalResideInUaeFee;

    return {
      total,
      breakdown: {
        licenseFee,
        totalVisaActivationFee,
        totalResideInUaeFee,
        baseLicenseFee,
        additionalVisaFee,
        visaActivationFee,
        establishmentCardFee,
        resideInUaeAdditionalFee,
      },
    };
  }

  public calculatePricingDetails(
    subscriptionPrice: number,
    visaRequired: number,
    visaPrice: number,
    governmentFee: number,
    validity: string,
  ) {
    const totalVisaPrice = visaRequired * visaPrice;
    const totalDue = subscriptionPrice + governmentFee;

    return {
      visa: {
        visaRequired,
        price: totalVisaPrice.toString(),
        billing: validity,
        currency: 'AED',
      },
      totalAmount: {
        governmentFee,
        totalDue,
      },
    };
  }

  public async sendKlaviyoEvent(
    eventName: string,
    properties: unknown,
    profile: unknown,
  ) {
    const privateApiKey = process.env.KLAVIYO_PRIVATE_KEY;

    const payload = {
      data: {
        type: 'event',
        attributes: {
          metric: {
            name: eventName,
          },
          profile,

          properties,
        },
      },
    };

    try {
      const res = await fetch('https://a.klaviyo.com/api/events/', {
        method: 'POST',
        headers: {
          Authorization: `Klaviyo-API-Key ${privateApiKey}`,
          'Content-Type': 'application/json',
          revision: '2023-02-22',
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorData: unknown = await res.json();
        throw new BadRequestException(JSON.stringify(errorData));
      }

      console.log('✅ Event sent to Klaviyo successfully.');
    } catch (err: unknown) {
      console.error('❌ Failed to send event:', err);
    }
  }
}
