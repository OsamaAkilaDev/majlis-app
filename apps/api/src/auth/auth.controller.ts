import { Body, Controller, Get, HttpCode, Post, Query, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiResponse } from '@nestjs/swagger';
import {
  forgotPasswordBodySchema,
  loginBodySchema,
  resetPasswordBodySchema,
  resetPasswordPreviewQuerySchema,
  resetPasswordPreviewSchema,
  sessionUserSchema,
  signupBodySchema,
  type ResetPasswordPreview,
  type SessionUser,
} from '@majlis/contracts';
import type { Response } from 'express';
import { createZodDto, ZodResponse } from 'nestjs-zod';
import { AuthService, RESET_LINK_INVALID, type AuthResult } from './auth.service';
import { secureCookies, sessionCookieOptions, SESSION_COOKIE } from './cookies';
import { Actor } from './actor.decorator';
import { ProblemDetailsDto } from '../common/problem/problem-details.dto';
import type { User } from '../generated/prisma/client';
import { Public } from './public.decorator';
import type { Env } from '../config/env.schema';

class SignupDto extends createZodDto(signupBodySchema) {}
class LoginDto extends createZodDto(loginBodySchema) {}
class ForgotPasswordDto extends createZodDto(forgotPasswordBodySchema) {}
class ResetPasswordDto extends createZodDto(resetPasswordBodySchema) {}
class ResetPasswordPreviewQueryDto extends createZodDto(resetPasswordPreviewQuerySchema) {}
class SessionUserDto extends createZodDto(sessionUserSchema) {}
class ResetPasswordPreviewDto extends createZodDto(resetPasswordPreviewSchema) {}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Public()
  @Post('signup')
  @ZodResponse({ status: 201, type: SessionUserDto })
  @ApiResponse({ status: 409, description: 'An account with this email already exists.', type: ProblemDetailsDto })
  async signup(@Body() body: SignupDto, @Res({ passthrough: true }) res: Response): Promise<SessionUser> {
    const result = await this.auth.signup(body);
    this.setSessionCookie(res, result);
    return result.user;
  }

  @Public()
  @Post('login')
  @ZodResponse({ status: 200, type: SessionUserDto })
  @ApiResponse({ status: 401, description: 'Email or password is incorrect.', type: ProblemDetailsDto })
  @ApiResponse({ status: 403, description: 'This account is suspended.', type: ProblemDetailsDto })
  async login(@Body() body: LoginDto, @Res({ passthrough: true }) res: Response): Promise<SessionUser> {
    const result = await this.auth.login(body);
    this.setSessionCookie(res, result);
    return result.user;
  }

  /** Always 202, or this is an account-existence oracle. */
  @Public()
  @Post('forgot-password')
  @HttpCode(202)
  async forgotPassword(@Body() body: ForgotPasswordDto): Promise<void> {
    await this.auth.forgotPassword(body);
  }

  /** Read-only: consuming the link here would spend it just by opening the page. */
  @Public()
  @Get('reset-password')
  @ZodResponse({ status: 200, type: ResetPasswordPreviewDto })
  @ApiResponse({ status: 401, description: RESET_LINK_INVALID, type: ProblemDetailsDto })
  previewReset(@Query() query: ResetPasswordPreviewQueryDto): Promise<ResetPasswordPreview> {
    return this.auth.previewReset(query);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(204)
  @ApiResponse({ status: 401, description: RESET_LINK_INVALID, type: ProblemDetailsDto })
  async resetPassword(@Body() body: ResetPasswordDto): Promise<void> {
    await this.auth.resetPassword(body);
  }

  @Get('me')
  @ZodResponse({ status: 200, type: SessionUserDto })
  @ApiResponse({ status: 401, description: 'Not signed in.', type: ProblemDetailsDto })
  me(@Actor() actor: User): Promise<SessionUser> {
    return this.auth.me(actor);
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  logout(@Res({ passthrough: true }) res: Response): void {
    const secure = secureCookies(this.config.get('NODE_ENV', { infer: true }));
    res.clearCookie(SESSION_COOKIE, sessionCookieOptions(secure));
  }

  private setSessionCookie(res: Response, result: AuthResult): void {
    const secure = secureCookies(this.config.get('NODE_ENV', { infer: true }));
    res.cookie(SESSION_COOKIE, result.userId, sessionCookieOptions(secure));
  }
}
