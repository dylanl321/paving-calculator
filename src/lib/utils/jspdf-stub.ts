// Stub for jsPDF when the package is not installed
// This allows the build to succeed. The actual jsPDF should be installed for production.

export class jsPDF {
	constructor(_config: any) {}

	internal = {
		pageSize: {
			getWidth: () => 612,
			getHeight: () => 792
		}
	};

	setFontSize(_size: number) {}
	setFont(_font: string, _style: string) {}
	setTextColor(..._args: any[]) {}
	setDrawColor(..._args: any[]) {}
	setFillColor(..._args: any[]) {}
	setLineWidth(_width: number) {}
	text(_text: any, _x: number, _y: number, _options?: any) {}
	line(_x1: number, _y1: number, _x2: number, _y2: number) {}
	rect(_x: number, _y: number, _w: number, _h: number, _style?: string) {}
	addImage(_data: any, _format: string, _x: number, _y: number, _w: number, _h: number) {}
	splitTextToSize(_text: string, _maxWidth: number): string[] {
		return [_text];
	}
	addPage() {}
	getNumberOfPages(): number {
		return 1;
	}
	setPage(_page: number) {}
	addImage(..._args: any[]) {}
	save(_filename: string) {
		alert(
			'PDF export requires jsPDF to be installed. Please run: npm install jspdf'
		);
	}
}
