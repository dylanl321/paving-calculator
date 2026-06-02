# CSV Import Feature - User Guide

## Overview

The CSV Import feature allows users to migrate historical paving data from spreadsheets into PaveRate. This is particularly useful for teams transitioning from Excel/Google Sheets to the PaveRate app.

## Accessing the Import Feature

1. Log in to PaveRate
2. Navigate to **Dashboard**
3. Click **Import** in the sidebar navigation

## Import Process

### Step 1: Upload CSV

1. **Select a Job Site** - Choose the job site where this historical data belongs
2. **Upload CSV File** - Either:
   - Drag and drop your CSV file into the upload zone
   - Click "Choose File" to browse for your CSV file
3. The system will show the filename and row count after upload
4. Click **Next: Review** to proceed

### Step 2: Review

1. Review the import details:
   - Job site name
   - Filename
   - Number of rows to import
2. Preview the first 3 rows of data to verify formatting
3. Click **Back** to change the file or job site
4. Click **Start Import** to begin the import

### Step 3: Import

The system will process your CSV file and import the data. This may take a moment for large files.

After completion, you'll see:
- Number of records imported
- Number of dates covered
- Any warnings or errors encountered

## CSV File Format

### Required Columns

Your CSV file **must** include a header row with at least the following column:

- `date` or `log_date` - Date in YYYY-MM-DD format (e.g., 2026-05-15)

### Optional Columns

All column names are **case-insensitive**. Alternative names are shown after the slash:

#### Entry Data Columns
- `timestamp` / `time` - Time in HH:MM format (defaults to 08:00 if not provided)
- `entry_type` - Type of entry: paving, milling, tack, break, delay, or note (defaults to paving)
- `station_start` - Starting station number
- `station_end` - Ending station number
- `distance_ft` / `distance` - Distance in feet
- `tons_placed` / `tons` - Tons of material placed
- `loads_count` / `loads` - Number of truck loads
- `spread_rate_actual` / `spread_rate` - Actual spread rate (lbs/sq yd)
- `tack_gallons` / `tack` - Tack coat gallons applied
- `lane` - Lane identifier (text)
- `notes` - Additional notes (text)

#### Daily Log Metadata Columns
These columns apply to the entire day and are taken from the first row for each date:

- `weather_temp_f` / `temp` - Temperature in Fahrenheit
- `weather_conditions` / `conditions` - Weather: clear, cloudy, rain, wind, or fog
- `crew_count` / `crew` - Number of crew members
- `start_time` - Work start time (HH:MM)
- `end_time` - Work end time (HH:MM)

## Example CSV

```csv
date,timestamp,entry_type,station_start,station_end,tons_placed,loads_count,spread_rate_actual,lane,notes,weather_temp_f,crew_count,start_time,end_time
2026-05-15,08:00,paving,10,12,185,10,92.5,Main,Morning paving run,72,8,07:00,16:00
2026-05-15,09:30,paving,12,15,277.5,15,92.5,Main,Continued paving,72,8,07:00,16:00
2026-05-15,14:00,tack,15,20,0,0,0,Main,Tack coat application,75,8,07:00,16:00
2026-05-16,08:15,paving,20,25,462.5,25,92.5,Main,Full day of paving,68,8,07:30,15:30
```

This example creates:
- 2 daily logs (one for 2026-05-15, one for 2026-05-16)
- 4 log entries total (3 on May 15, 1 on May 16)

## Data Grouping

The import process automatically groups rows by date:

1. **Daily Logs** - One daily log is created (or updated if it exists) for each unique date
2. **Log Entries** - All rows for a given date become separate entries in that day's log
3. **Metadata** - Weather, crew count, and start/end times are taken from the first row of each date

## File Limits

- Maximum file size: 10 MB
- Supported format: CSV only

## Tips for Success

1. **Test with a small file first** - Import 5-10 rows to verify your format before importing hundreds of rows
2. **Use consistent date format** - Always use YYYY-MM-DD (e.g., 2026-05-15, not 5/15/2026)
3. **Include headers** - The first row must be column names
4. **Check for errors** - Review any warnings shown after import completion
5. **Verify data** - After import, check a few dates in the job site's daily log to ensure data imported correctly

## Common Issues

### "Invalid or missing date"
- Ensure date column is named `date` or `log_date`
- Use YYYY-MM-DD format only
- Check for empty date cells

### "Invalid timestamp"
- Time must be in HH:MM format (e.g., 08:00, 14:30)
- Use 24-hour format

### "Access denied"
- Ensure your organization owns the selected job site
- Contact your admin if you should have access

### "No valid rows to import"
- Check that at least one row has a valid date
- Verify column names match the supported format
- Ensure file has a header row plus at least one data row

## Support

If you encounter issues not covered here, please contact support at the PaveRate dashboard or refer to the main documentation.
