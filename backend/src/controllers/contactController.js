import { z } from 'zod';
import { submitContactMessage } from '../services/contactService.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const contactValidationSchema = z
  .object({
    name: z
      .string({ required_error: 'Name is required' })
      .trim()
      .min(2, 'Name must be between 2 and 80 characters')
      .max(80, 'Name must be between 2 and 80 characters'),
    email: z
      .string({ required_error: 'Email is required' })
      .trim()
      .email('Please provide a valid email address'),
    message: z
      .string({ required_error: 'Message is required' })
      .trim()
      .min(10, 'Message must be between 10 and 2000 characters')
      .max(2000, 'Message must be between 10 and 2000 characters'),
    website: z.string().optional()
  })
  .strict({ message: 'Unrecognized fields provided' });

/**
 * POST /api/v1/contact
 * Public endpoint for contact form submissions.
 */
export const handleContactSubmission = asyncHandler(async (req, res) => {
  await submitContactMessage(req.body);

  res.status(200).json({
    success: true,
    message: 'Your message has been sent successfully. We will be in touch shortly.'
  });
});
