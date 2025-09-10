export interface IResponse {
    success: boolean;
    data: any;
    message: string;
}

export class FilterDto {
    searchTerm: string;
    sortBy: string;
    sortOrder: string;
    selectedRole: string;
    trial: string;
    gift: string;
    unsubscribed: string;
}

export class FoodLogsFilterDto {
    id: string;
    startDate: string;
    endDate: string;
}