export interface IResponse {
    success: boolean;
    data: any;
    message: string;
}

export class FilterDto {
    search: string;
    sort_by: string;
    order_by: string;
    userType: string;
}