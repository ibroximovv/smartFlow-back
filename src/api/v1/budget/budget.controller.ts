import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UseGuards } from '@nestjs/common';
import { BudgetService } from './budget.service';
import { CreateBudgetDto } from './dto/create-budget.dto';
import { UpdateBudgetDto } from './dto/update-budget.dto';
import { GetBudgetDto } from './dto/get-budget.dto';
import { AuthGuard } from '@common/guards/auth.guard';
import { RolesGuard } from '@common/guards/roles.guard';
import { ApiBearerAuth } from '@nestjs/swagger';
import { RolesDecorator } from '@common/decorators/roles.decorator';
import { UserRole } from '@common/constants';

@Controller('budget')
export class BudgetController {
  constructor(private readonly budgetService: BudgetService) { }

  @RolesDecorator(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.APPROVER)
  @UseGuards(AuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Post()
  create(@Body() createBudgetDto: CreateBudgetDto) {
    return this.budgetService.createBudget(createBudgetDto);
  }

  @Get()
  findAll(@Query() query: GetBudgetDto) {
    return this.budgetService.findAllBudget(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.budgetService.findOneBudget(id);
  }

  @RolesDecorator(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.APPROVER)
  @UseGuards(AuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Patch(':id')
  update(@Param('id') id: string, @Body() updateBudgetDto: UpdateBudgetDto) {
    return this.budgetService.update(id, updateBudgetDto);
  }

  @RolesDecorator(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.APPROVER)
  @UseGuards(AuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.budgetService.delete(id);
  }
}
