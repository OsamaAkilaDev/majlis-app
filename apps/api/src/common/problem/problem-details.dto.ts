import { problemDetailsSchema } from '@majlis/contracts';
import { createZodDto } from 'nestjs-zod';

export class ProblemDetailsDto extends createZodDto(problemDetailsSchema) {}
