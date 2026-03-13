package nl.inl.corpuswebsite.utils;

import jakarta.servlet.http.HttpServletResponse;

public class HttpException extends RuntimeException {
	int code;
	String body;


	// A extends RTE
	// B extends A
	// catch B will not catch A

	// So what we need is for B to be QueryException
	// A should be ReturnToClientException

	// We catch B everywhere, which A will skip?
	// Oh yeah, if you catch very wide exceptions, that's fine. 
	
	
	public HttpException(Exception e) {
		super(e);
		if (e instanceof HttpException) {
			this.code = ((HttpException) e ).getHttpStatusCode();
			this.body = ((HttpException) e).getBody();
		} else {
			this.code = HttpServletResponse.SC_INTERNAL_SERVER_ERROR;
			this.body = e.getMessage();
		}
	}
	public HttpException(int code, String body) {
		super(body);
		this.code = code;
		this.body = body;
	}
	public HttpException(int code) {
		this(code, "");
	}
	public HttpException(String body) {
		this(HttpServletResponse.SC_INTERNAL_SERVER_ERROR, body);
	}
	public HttpException() {
		this(HttpServletResponse.SC_INTERNAL_SERVER_ERROR, "");
	}

	public int getHttpStatusCode() {
		return code;
	}

	public String getBody() {
		return body;
	}

	public static HttpException wrap(Exception e) {
		if (e instanceof HttpException) return (HttpException) e;
		else return new HttpException(e);
	}
}
