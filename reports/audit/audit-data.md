# Audit Data for alex@gmail.com

**Audit Time:** 2026-11-12T15:21:49.854Z
**User:** alex jonhson (alex@gmail.com, ID: `6ae857e8c8ba1080c43fa1ff`)

## Application: Broken Server

- **ID:** `6aead07611d4124430f78664`
- **URL:** `https://httpbin.org/status/503`
- **Application Status:** `undefined`
- **SLO Status:** `N/A`
- **SLO:** None configured

## Application: DummyJSON API

- **ID:** `6af1d3871188954bd9a90a69`
- **URL:** `https://dummyjson.com/products`
- **Application Status:** `undefined`
- **SLO Status:** `N/A`
- **SLO:** None configured

## Application: GitHub Public API

- **ID:** `6af58f8604c366835bbce2d1`
- **URL:** `https://api.github.com/zen`
- **Application Status:** `down`
- **SLO Status:** `breached`
- **Target:** 99.9%
- **Window:** 30 days

### Raw Counts in Rolling Window
- **Total:** 367
- **Good:** 281
- **Bad:** 86
- **First Check:** 2026-11-12T10:06:08.892Z
- **Last Check:** 2026-11-12T15:21:46.574Z

### Status Code Breakdown
| Status Code | Count |
| --- | --- |
| 200 | 281 |
| 403 | 86 |

### Error Type Breakdown
| Error Type | Count |
| --- | --- |
| none | 281 |
| http_error | 86 |

### Rollup Drift Analysis
- **Raw Total:** 367
- **Hybrid Total (Boundary Raw + Daily Rollups):** 367 (Boundary: 0, Rollups: 367)
- **Total Drift:** 0
- **Good Drift:** 0
- **Bad Drift:** 0

### Independent Calculation vs API Result
| Metric | Independent | API | Difference |
| --- | --- | --- | --- |
| SLI (%) | 76.57% | 76.57% | 0 |
| Consumed (%) | 23433.24% | 23433.24% | 0 |
| Remaining (%) | 0% | 0% | 0 |
| Burn Rate 1h | 333.33 | 333.33 | 0 |
| Burn Rate 6h | 234.33 | 234.33 | 0 |
| Status | breached | breached | MATCH |

### Data Integrity
- **Foreign Owner Checks:** 0
- **Future Checks:** 0
- **Duplicate Check Seconds:** 1 (Total excess checks: 1)

### Incident Timeline
| Incident ID | Status | Title | Severity | Failures | Started At | Resolved At | Duration (s) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `6af5b9c19441b87510d47704` | resolved | GitHub Public API is down | high | 29 | 2026-11-12T13:06:09.870Z | 2026-11-12T13:26:18.421Z | 1209 |
| `6af5c745b4f592eb3e7244ae` | resolved | GitHub Public API is down | high | 34 | 2026-11-12T14:03:49.273Z | 2026-11-12T14:26:40.243Z | 1371 |
| `6af5d60208ce186991d471d5` | open | GitHub Public API is down | high | 23 | 2026-11-12T15:06:42.418Z | active | N/A |

### Status Transitions (Consecutive Check Rule)
- **2026-11-12T13:06:09.856Z:** FAILED_TO_DOWN ({"statusCode":403,"errorType":"http_error","errorMessage":"Server returned an unsuccessful HTTP status code"})
- **2026-11-12T13:26:18.357Z:** RECOVERED_TO_UP ({"statusCode":200,"responseTimeMs":209})
- **2026-11-12T14:03:49.255Z:** FAILED_TO_DOWN ({"statusCode":403,"errorType":"http_error","errorMessage":"Server returned an unsuccessful HTTP status code"})
- **2026-11-12T14:26:40.232Z:** RECOVERED_TO_UP ({"statusCode":200,"responseTimeMs":206})
- **2026-11-12T15:06:42.407Z:** FAILED_TO_DOWN ({"statusCode":403,"errorType":"http_error","errorMessage":"Server returned an unsuccessful HTTP status code"})

### Last 30 Checks
| Timestamp | Status Code | Success | Response Time | Error Type |
| --- | --- | --- | --- | --- |
| 2026-11-12T15:21:46.574Z | 403 | false | 543ms | http_error |
| 2026-11-12T15:21:06.343Z | 403 | false | 339ms | http_error |
| 2026-11-12T15:20:26.498Z | 403 | false | 507ms | http_error |
| 2026-11-12T15:19:36.145Z | 403 | false | 200ms | http_error |
| 2026-11-12T15:18:56.148Z | 403 | false | 236ms | http_error |
| 2026-11-12T15:18:16.057Z | 403 | false | 188ms | http_error |
| 2026-11-12T15:17:36.127Z | 403 | false | 273ms | http_error |
| 2026-11-12T15:16:56.040Z | 403 | false | 202ms | http_error |
| 2026-11-12T15:16:16.015Z | 403 | false | 201ms | http_error |
| 2026-11-12T15:15:36.007Z | 403 | false | 217ms | http_error |
| 2026-11-12T15:14:56.119Z | 403 | false | 337ms | http_error |
| 2026-11-12T15:14:15.963Z | 403 | false | 202ms | http_error |
| 2026-11-12T15:13:36.068Z | 403 | false | 344ms | http_error |
| 2026-11-12T15:12:55.950Z | 403 | false | 247ms | http_error |
| 2026-11-12T15:12:15.844Z | 403 | false | 176ms | http_error |
| 2026-11-12T15:11:35.814Z | 403 | false | 190ms | http_error |
| 2026-11-12T15:10:55.768Z | 403 | false | 172ms | http_error |
| 2026-11-12T15:10:15.771Z | 403 | false | 207ms | http_error |
| 2026-11-12T15:09:35.756Z | 403 | false | 206ms | http_error |
| 2026-11-12T15:08:45.723Z | 403 | false | 198ms | http_error |
| 2026-11-12T15:07:22.384Z | 403 | false | 193ms | http_error |
| 2026-11-12T15:06:42.407Z | 403 | false | 240ms | http_error |
| 2026-11-12T15:05:52.277Z | 403 | false | 141ms | http_error |
| 2026-11-12T15:05:12.327Z | 200 | true | 219ms | none |
| 2026-11-12T15:04:32.247Z | 200 | true | 159ms | none |
| 2026-11-12T15:03:52.190Z | 200 | true | 125ms | none |
| 2026-11-12T15:03:12.241Z | 200 | true | 205ms | none |
| 2026-11-12T15:02:32.424Z | 200 | true | 418ms | none |
| 2026-11-12T15:01:52.323Z | 200 | true | 328ms | none |
| 2026-11-12T15:01:12.171Z | 200 | true | 179ms | none |

## Application: Google

- **ID:** `6af1d0de1188954bd9a90633`
- **URL:** `https://www.google.com/`
- **Application Status:** `up`
- **SLO Status:** `breached`
- **Target:** 99.9%
- **Window:** 30 days

### Raw Counts in Rolling Window
- **Total:** 174
- **Good:** 172
- **Bad:** 2
- **First Check:** 2026-11-09T13:55:46.099Z
- **Last Check:** 2026-11-12T15:19:46.254Z

### Status Code Breakdown
| Status Code | Count |
| --- | --- |
| 200 | 172 |
| null | 2 |

### Error Type Breakdown
| Error Type | Count |
| --- | --- |
| none | 172 |
| dns_error | 2 |

### Rollup Drift Analysis
- **Raw Total:** 174
- **Hybrid Total (Boundary Raw + Daily Rollups):** 174 (Boundary: 0, Rollups: 174)
- **Total Drift:** 0
- **Good Drift:** 0
- **Bad Drift:** 0

### Independent Calculation vs API Result
| Metric | Independent | API | Difference |
| --- | --- | --- | --- |
| SLI (%) | 98.85% | 98.85% | 0 |
| Consumed (%) | 1149.43% | 1149.43% | 0 |
| Remaining (%) | 0% | 0% | 0 |
| Burn Rate 1h | 0 | 0 | 0 |
| Burn Rate 6h | 0 | 0 | 0 |
| Status | breached | breached | MATCH |

### Data Integrity
- **Foreign Owner Checks:** 0
- **Future Checks:** 0
- **Duplicate Check Seconds:** 0 (Total excess checks: 0)

## Application: HTTPBin Failure

- **ID:** `6af1d15c1188954bd9a906dd`
- **URL:** `https://httpbin.org/status/500`
- **Application Status:** `undefined`
- **SLO Status:** `N/A`
- **SLO:** None configured

## Application: HTTPBin Slow

- **ID:** `6af1d1711188954bd9a90703`
- **URL:** `https://httpbin.org/delay/5`
- **Application Status:** `undefined`
- **SLO Status:** `N/A`
- **SLO:** None configured

## Application: HTTPBin Success

- **ID:** `6af1d1461188954bd9a906ba`
- **URL:** `https://httpbin.org/status/200`
- **Application Status:** `undefined`
- **SLO Status:** `N/A`
- **SLO:** None configured

## Application: JSONPlaceholder

- **ID:** `6af1d1211188954bd9a9068d`
- **URL:** `https://jsonplaceholder.typicode.com/posts`
- **Application Status:** `undefined`
- **SLO Status:** `N/A`
- **SLO:** None configured

## Application: Payment API Recovery Test

- **ID:** `6af317763d2a1dddb4688c5f`
- **URL:** `https://https-httpbin-org-status-418.free.beeceptor.com/health`
- **Application Status:** `down`
- **SLO Status:** `breached`
- **Target:** 99.9%
- **Window:** 30 days

### Raw Counts in Rolling Window
- **Total:** 855
- **Good:** 90
- **Bad:** 765
- **First Check:** 2026-11-10T13:09:21.292Z
- **Last Check:** 2026-11-12T15:21:47.145Z

### Status Code Breakdown
| Status Code | Count |
| --- | --- |
| 200 | 90 |
| 429 | 754 |
| 500 | 5 |
| null | 6 |

### Error Type Breakdown
| Error Type | Count |
| --- | --- |
| http_error | 759 |
| none | 90 |
| dns_error | 4 |
| timeout | 1 |
| connection_reset | 1 |

### Rollup Drift Analysis
- **Raw Total:** 855
- **Hybrid Total (Boundary Raw + Daily Rollups):** 855 (Boundary: 0, Rollups: 855)
- **Total Drift:** 0
- **Good Drift:** 0
- **Bad Drift:** 0

### Independent Calculation vs API Result
| Metric | Independent | API | Difference |
| --- | --- | --- | --- |
| SLI (%) | 10.53% | 10.53% | 0 |
| Consumed (%) | 89473.68% | 89473.68% | 0 |
| Remaining (%) | 0% | 0% | 0 |
| Burn Rate 1h | 1000 | 1000 | 0 |
| Burn Rate 6h | 1000 | 1000 | 0 |
| Status | breached | breached | MATCH |

### Data Integrity
- **Foreign Owner Checks:** 0
- **Future Checks:** 0
- **Duplicate Check Seconds:** 0 (Total excess checks: 0)

### Incident Timeline
| Incident ID | Status | Title | Severity | Failures | Started At | Resolved At | Duration (s) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `6af317a93d2a1dddb4688cfd` | resolved | Payment API Recovery Test is down | high | 5 | 2026-11-10T13:10:01.187Z | 2026-11-10T13:13:21.586Z | 200 |
| `6af321bf62e57416c3c67d6f` | resolved | Payment API Recovery Test is down | high | 296 | 2026-11-10T13:53:03.809Z | 2026-11-12T07:03:47.882Z | 148244 |
| `6af56d96da0480849c45aad3` | open | Payment API Recovery Test is down | high | 462 | 2026-11-12T07:41:10.975Z | active | N/A |

### Status Transitions (Consecutive Check Rule)
- **2026-11-10T13:10:01.176Z:** FAILED_TO_DOWN ({"statusCode":500,"errorType":"http_error","errorMessage":"Server returned an unsuccessful HTTP status code"})
- **2026-11-10T13:13:21.554Z:** RECOVERED_TO_UP ({"statusCode":200,"responseTimeMs":1053})
- **2026-11-10T13:53:03.797Z:** FAILED_TO_DOWN ({"statusCode":429,"errorType":"http_error","errorMessage":"Server returned an unsuccessful HTTP status code"})
- **2026-11-12T07:03:47.869Z:** RECOVERED_TO_UP ({"statusCode":200,"responseTimeMs":976})
- **2026-11-12T07:41:10.966Z:** FAILED_TO_DOWN ({"statusCode":429,"errorType":"http_error","errorMessage":"Server returned an unsuccessful HTTP status code"})

### Last 30 Checks
| Timestamp | Status Code | Success | Response Time | Error Type |
| --- | --- | --- | --- | --- |
| 2026-11-12T15:21:47.145Z | 429 | false | 1113ms | http_error |
| 2026-11-12T15:21:06.969Z | 429 | false | 965ms | http_error |
| 2026-11-12T15:20:27.150Z | 429 | false | 1158ms | http_error |
| 2026-11-12T15:19:36.856Z | 429 | false | 910ms | http_error |
| 2026-11-12T15:18:56.869Z | 429 | false | 955ms | http_error |
| 2026-11-12T15:18:16.777Z | 429 | false | 907ms | http_error |
| 2026-11-12T15:17:36.825Z | 429 | false | 970ms | http_error |
| 2026-11-12T15:16:56.717Z | 429 | false | 878ms | http_error |
| 2026-11-12T15:16:17.262Z | 429 | false | 1451ms | http_error |
| 2026-11-12T15:15:26.707Z | 429 | false | 920ms | http_error |
| 2026-11-12T15:14:46.709Z | 429 | false | 932ms | http_error |
| 2026-11-12T15:13:57.084Z | 429 | false | 1342ms | http_error |
| 2026-11-12T15:13:16.705Z | 429 | false | 992ms | http_error |
| 2026-11-12T15:12:36.611Z | 429 | false | 919ms | http_error |
| 2026-11-12T15:11:56.577Z | 429 | false | 927ms | http_error |
| 2026-11-12T15:11:16.562Z | 429 | false | 943ms | http_error |
| 2026-11-12T15:10:36.591Z | 429 | false | 1004ms | http_error |
| 2026-11-12T15:09:46.449Z | 429 | false | 907ms | http_error |
| 2026-11-12T15:08:46.490Z | 429 | false | 964ms | http_error |
| 2026-11-12T15:07:23.175Z | 429 | false | 982ms | http_error |
| 2026-11-12T15:06:43.028Z | 429 | false | 859ms | http_error |
| 2026-11-12T15:05:53.040Z | 429 | false | 903ms | http_error |
| 2026-11-12T15:05:12.995Z | 429 | false | 886ms | http_error |
| 2026-11-12T15:04:32.986Z | 429 | false | 898ms | http_error |
| 2026-11-12T15:03:52.962Z | 429 | false | 895ms | http_error |
| 2026-11-12T15:03:12.921Z | 429 | false | 884ms | http_error |
| 2026-11-12T15:02:33.048Z | 429 | false | 1048ms | http_error |
| 2026-11-12T15:01:42.873Z | 429 | false | 875ms | http_error |
| 2026-11-12T15:01:02.932Z | 429 | false | 941ms | http_error |
| 2026-11-12T15:00:22.875Z | 429 | false | 888ms | http_error |

## Application: Payment API Test2

- **ID:** `6af310bf3d2a1dddb4688121`
- **URL:** `https://httpstat.us/200`
- **Application Status:** `undefined`
- **SLO Status:** `N/A`
- **SLO:** None configured

## Application: Payment Gateway Test

- **ID:** `6af311513d2a1dddb4688203`
- **URL:** `https://httpbin.org/status/418`
- **Application Status:** `undefined`
- **SLO Status:** `N/A`
- **SLO:** None configured

## Application: Production API

- **ID:** `6ae8709a71494c1b67095ec9`
- **URL:** `https://api.example.com/health`
- **Application Status:** `undefined`
- **SLO Status:** `N/A`
- **SLO:** None configured

## Application: [DEMO] Core Authentication Service

- **ID:** `6ae8e0e5754d1af07caa5a9c`
- **URL:** `https://auth.pulse-demo.io`
- **Application Status:** `undefined`
- **SLO Status:** `N/A`
- **SLO:** None configured

## Application: [DEMO] Notifications & Webhooks Worker

- **ID:** `6ae8e0e5754d1af07caa5974`
- **URL:** `https://worker-dev.pulse-demo.io`
- **Application Status:** `undefined`
- **SLO Status:** `N/A`
- **SLO:** None configured

## Application: [DEMO] Payment & Checkout Gateway

- **ID:** `6ae8e0e5754d1af07caa584b`
- **URL:** `https://checkout.pulse-demo.io`
- **Application Status:** `undefined`
- **SLO Status:** `N/A`
- **SLO:** None configured

## Application: [DEMO] Search & Catalog API

- **ID:** `6ae8e0e5754d1af07caa5bc0`
- **URL:** `https://catalog-staging.pulse-demo.io`
- **Application Status:** `undefined`
- **SLO Status:** `N/A`
- **SLO:** None configured

## Application: example

- **ID:** `6aeacf5a11d4124430f785af`
- **URL:** `https://example.com/`
- **Application Status:** `undefined`
- **SLO Status:** `N/A`
- **SLO:** None configured

## Application: scmc

- **ID:** `6aead34611d4124430f78a56`
- **URL:** `https://smart-complaint-management-system-kappa.vercel.app/`
- **Application Status:** `up`
- **SLO Status:** `breached`
- **Target:** 99.9%
- **Window:** 30 days

### Raw Counts in Rolling Window
- **Total:** 1321
- **Good:** 1306
- **Bad:** 15
- **First Check:** 2026-11-04T06:40:10.565Z
- **Last Check:** 2026-11-12T15:21:26.223Z

### Status Code Breakdown
| Status Code | Count |
| --- | --- |
| 200 | 1306 |
| null | 15 |

### Error Type Breakdown
| Error Type | Count |
| --- | --- |
| none | 1306 |
| dns_error | 13 |
| timeout | 1 |
| connection_reset | 1 |

### Rollup Drift Analysis
- **Raw Total:** 1321
- **Hybrid Total (Boundary Raw + Daily Rollups):** 1321 (Boundary: 0, Rollups: 1321)
- **Total Drift:** 0
- **Good Drift:** 0
- **Bad Drift:** 0

### Independent Calculation vs API Result
| Metric | Independent | API | Difference |
| --- | --- | --- | --- |
| SLI (%) | 98.86% | 98.86% | 0 |
| Consumed (%) | 1135.5% | 1135.5% | 0 |
| Remaining (%) | 0% | 0% | 0 |
| Burn Rate 1h | 0 | 0 | 0 |
| Burn Rate 6h | 2.52 | 2.52 | 0 |
| Status | breached | breached | MATCH |

### Data Integrity
- **Foreign Owner Checks:** 0
- **Future Checks:** 0
- **Duplicate Check Seconds:** 0 (Total excess checks: 0)

## Application: slow site

- **ID:** `6aeacfad11d4124430f785d8`
- **URL:** `https://httpbin.org/delay/3`
- **Application Status:** `undefined`
- **SLO Status:** `N/A`
- **SLO:** None configured

## Application: timeout

- **ID:** `6aead00011d4124430f78604`
- **URL:** `https://httpbin.org/delay/10`
- **Application Status:** `undefined`
- **SLO Status:** `N/A`
- **SLO:** None configured

